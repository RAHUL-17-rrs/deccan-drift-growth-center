create function audit_row() returns trigger language plpgsql as $$
declare oldj jsonb; newj jsonb;
begin
 if tg_op<>'INSERT' then oldj=to_jsonb(old); end if;
 if tg_op<>'DELETE' then newj=to_jsonb(new); end if;
 insert into growth_audit.log(actor,entity,key,before,after) values(coalesce(nullif(current_setting('growth.actor',true),''),'Local operator'),tg_table_name,coalesce(newj->>tg_argv[0],oldj->>tg_argv[0]),oldj,newj);
 return null;
end$$;
do $$declare rec record;
begin for rec in select * from (values ('raw_marketing','activity_id'),('raw_checkins','event_id'),('raw_people','person_id'),('raw_registrations','registration_id'),('raw_history','history_id'),('raw_targets','effective_at'),('raw_campaigns','campaign_id'),('campaign_settings','campaign_id'),('tasks','id'),('settings','id'),('pace_curve','day'),('plan_channels','name'),('plan_gates','name')) v(tbl,k)
loop execute format('create trigger audit after insert or update or delete on %I for each row execute function audit_row(%L)',rec.tbl,rec.k); end loop; end$$;
create function fn_drivers(d date,a text,c text,days int) returns table(previous_regs numeric,current_regs numeric,delta numeric,spend_effect numeric,efficiency_effect numeric,conversion_effect numeric) language sql stable as $$
 with t as(select * from fn_trend(d,a,c) where day>d-days*2),p as(select coalesce(sum(spend) filter(where day<=d-days),0) s0,coalesce(sum(spend) filter(where day>d-days),0) s1,coalesce(sum(sessions) filter(where day<=d-days),0) v0,coalesce(sum(sessions) filter(where day>d-days),0) v1,coalesce(sum(regs) filter(where day<=d-days),0) r0,coalesce(sum(regs) filter(where day>d-days),0) r1 from t)
 select r0,r1,r1-r0,case when least(s0,s1,v0,v1)>0 then (s1-s0)*r0/s0 end,case when least(s0,s1,v0,v1)>0 then s1*(v1/s1-v0/s0)*r0/v0 end,case when least(s0,s1,v0,v1)>0 then v1*(r1/v1-r0/v0) end from p$$;
create function fn_bottleneck(d date,a text) returns table(name text,stage text,rate numeric,best_rate numeric,gap numeric) language sql stable as $$
 with m as(select * from fn_campaign_metrics(d,a) where cid is not null), s as(select name,'Session → registration' stage,conversion rate from m union all select name,'Registration → attendance',showup from m where d>=(select event_starts_at::date from clean_event)),x as(select *,max(rate) over(partition by stage) best from s where rate is not null)
 select name,stage,rate,best,best-rate from x order by best-rate desc,name limit 1$$;
create function fn_diagnosis(d date,a text) returns table(names text,spend_share numeric,attendee_share numeric,showup numeric,channels text[]) language sql stable as $$
 with m as(select * from fn_campaign_metrics(d,a) where cid is not null and cpa is not null order by cpa desc,name limit 2)
 select string_agg(name,' and ' order by cpa desc),sum(spend_share),sum(attendee_share),ratio(sum(registered_attendees),sum(regs)),array_agg(cid order by cpa desc) from m$$;
create function fn_winback(d date,a text) returns table(person_id text,person_name text,cid text,name text,owner_name text,status text,opted_out boolean) language sql stable as $$
 select s.person_id,p.person_name,s.cid,c.campaign_name,coalesce(c.owner_name,s.owner_name),s.status,opt.person_id is not null from fn_status(d,a) s join fn_people(d) p using(person_id) left join clean_campaigns c on c.campaign_id=s.cid left join (select distinct person_id from clean_engagement where event_type='opted_out' and occurred_at<cutoff(d)) opt on opt.person_id=s.person_id where s.status in ('cancelled','waitlisted') order by p.person_name,s.person_id$$;
create function apply_task_change() returns trigger language plpgsql as $$
begin
 if new.status='done' and new.proposed is not null and new.proposed<>'{}'::jsonb and not new.applied then
  if current_setting('growth.confirm_apply',true) is distinct from 'yes' then raise exception 'Confirm the proposed campaign change before completing this task'; end if;
  if new.campaign_id is null or not exists(select 1 from clean_campaigns where campaign_id=new.campaign_id) then raise exception 'A current linked campaign is required';end if;
  insert into campaign_settings(campaign_id) values(new.campaign_id) on conflict do nothing;
  update campaign_settings set status=coalesce(new.proposed->>'status',status),budget=coalesce((new.proposed->>'budget')::numeric,budget),plan_cpr=coalesce((new.proposed->>'plan_cpr')::numeric,plan_cpr) where campaign_id=new.campaign_id;
  new.applied=true;
 end if;
 return new;
end$$;
create trigger task_changes before insert or update on tasks for each row execute function apply_task_change();
do $$begin
 if not exists(select 1 from pg_roles where rolname='growth_reader') then
  create role growth_reader nologin nosuperuser nocreatedb nocreaterole noinherit;
 end if;
exception when duplicate_object or unique_violation then null;
end$$;
-- Hosted (non-superuser) owners need membership to `set role growth_reader`.
do $$begin
 if not pg_has_role(current_user,'growth_reader','member') then
  execute format('grant growth_reader to %I', current_user);
 end if;
exception when others then null;
end$$;
analyze;

