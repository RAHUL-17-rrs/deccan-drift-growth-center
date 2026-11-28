create table campaign_settings (
 campaign_id text primary key, status text default 'active' check(status in ('active','paused','stopped')),
 budget numeric check(budget>=0), plan_cpr numeric check(plan_cpr>0),
 expected_showup numeric check(expected_showup between 0 and 1)
);
-- Allocations start as a split of the latest approved budget in proportion to 2025 net spend (editable).
insert into campaign_settings(campaign_id,expected_showup,budget)
 select c.campaign_id,b.showup,round(coalesce(s.spend,0)*t.budget/nullif(t.total,0)/500)*500
 from clean_campaigns c left join benchmarks b on b.name=c.campaign_name
 left join (select campaign_id,sum(marketing_spend_inr) spend from clean_marketing group by 1) s using(campaign_id)
 cross join (select (select marketing_budget_inr from raw_targets order by effective_at desc limit 1) budget,(select sum(marketing_spend_inr) from clean_marketing) total) t;
update campaign_settings set budget=budget+((select marketing_budget_inr from raw_targets order by effective_at desc limit 1)-(select sum(budget) from campaign_settings))
 where campaign_id=(select campaign_id from campaign_settings order by budget desc,campaign_id limit 1);
create table settings(id int primary key default 1 check(id=1), scale numeric default .8, stop numeric default 1.5,
 k numeric default .35, paid_k numeric default .2, walkins int default 125,
 check(scale>0 and stop>scale and k between 0 and 1 and paid_k between 0 and 1 and walkins>=0));
insert into settings default values;
create table pace_curve(day date primary key, share numeric not null check(share between 0 and 1));
insert into pace_curve values ('2025-01-15',0),('2025-03-01',.40),('2025-03-15',.54),('2025-03-29',.78),('2025-04-05',.90),('2025-04-12',1);
create table tasks(id uuid primary key default gen_random_uuid(),title text not null check(length(trim(title))>0),description text,owner text not null,deadline date,status text default 'todo' check(status in ('todo','doing','done')),priority text default 'normal' check(priority in ('low','normal','high')),campaign_id text,created_by text not null,actor text,source text,proposed jsonb,applied boolean not null default false,created_at timestamptz default now());
create table conversations(id uuid primary key, state jsonb not null default '{}', messages jsonb not null default '[]');
create table drafts(id uuid primary key default gen_random_uuid(),conversation_id uuid not null, payload jsonb not null, actor text not null, resolution text default 'pending',task_id uuid);
create function cutoff(d date) returns timestamptz language sql immutable as $$select (d+1)::timestamp at time zone 'Asia/Kolkata'$$;
create function ratio(n numeric,b numeric) returns numeric language sql immutable as $$select n/nullif(b,0)$$;
create function fn_targets(d date) returns setof raw_targets language sql stable as $$select * from clean_targets where effective_at<cutoff(d) order by effective_at desc limit 1$$;
create function fn_people(d date) returns setof raw_people language sql stable as $$select * from clean_people where person_type='external' and first_seen_at<cutoff(d)$$;
create function fn_regs(d date,a text) returns table(registration_id text, person_id text, cid text, registered_at timestamptz, owner_name text) language sql stable as $$
 select r.registration_id,r.person_id,case when a='first-touch' then p.first_campaign_id else r.campaign_id end,r.registered_at,r.owner_name
 from clean_registrations r join fn_people(d) p using(person_id) where r.registered_at<cutoff(d)$$;
create function fn_status(d date,a text) returns table(registration_id text,person_id text,cid text,status text,owner_name text) language sql stable as $$
 select distinct on(r.registration_id) r.registration_id,r.person_id,r.cid,h.status,r.owner_name from fn_regs(d,a) r join clean_history h using(registration_id)
 where h.effective_at<cutoff(d) order by r.registration_id,h.effective_at desc,h.history_id desc$$;
create function fn_entries(d date,a text) returns table(event_id text,person_id text,cid text,occurred_at timestamptz,source text,registered boolean) language sql stable as $$
 select e.event_id,e.person_id,case when a='first-touch' then p.first_campaign_id else coalesce(link.campaign_id,r.campaign_id) end,e.occurred_at,e.source,coalesce(link.registration_id,r.registration_id) is not null
 from clean_checkins e join fn_people(d) p using(person_id)
 left join clean_registrations link on link.registration_id=e.registration_id and link.person_id=e.person_id and link.registered_at<cutoff(d)
 left join
 (select distinct on (person_id) person_id,campaign_id,registration_id from clean_registrations where registered_at<cutoff(d) order by person_id,registered_at,registration_id) r on r.person_id=e.person_id
 where e.occurred_at<cutoff(d) and e.result='admitted' and e.verification='verified'$$;
create function fn_visitors(d date,a text) returns table(person_id text,cid text,registered boolean,first_entry timestamptz) language sql stable as $$
 select distinct on(person_id) person_id,cid,registered,occurred_at from fn_entries(d,a) order by person_id,occurred_at,event_id$$;
create function fn_campaign_metrics(d date,a text) returns table(cid text,name text,channel text,owner text,operating_status text,spend numeric,sessions numeric,identified bigint,regs bigint,attendees bigint,confirmed bigint,registered_attendees bigint,cpr numeric,cpa numeric,showup numeric,conversion numeric,spend_share numeric,attendee_share numeric,plan_cpr numeric,budget numeric,expected_showup numeric,open_tasks bigint) language sql stable as $$
 with reg as materialized(select * from fn_regs(d,a)),
 p as (select coalesce(case when a='registration' then r.cid end,p.first_campaign_id) cid,count(*) n from fn_people(d) p left join (select distinct on(person_id) * from reg order by person_id,registered_at,registration_id) r using(person_id) group by 1),
 r as(select cid,count(*) n from reg group by 1), v as(select cid,count(*) n,count(*) filter(where registered) matched from fn_visitors(d,a) group by 1),
 h as(select cid,count(*) n from fn_status(d,a) where status='confirmed' group by 1),m as(select campaign_id cid,sum(marketing_spend_inr) spend,sum(landing_page_sessions) sessions from clean_marketing where activity_date<=d group by 1),
 c as(select campaign_id cid,campaign_name name,channel,owner_name from clean_campaigns where created_at<cutoff(d) union all select null,'Walk-in / unattributed',null,null),
 b as(select c.*,coalesce(cfg.status,'active') os,coalesce(m.spend,0) sp,coalesce(m.sessions,0) se,coalesce(p.n,0) pe,coalesce(r.n,0) re,coalesce(v.n,0) at,coalesce(h.n,0) co,coalesce(v.matched,0) ma,coalesce(cfg.plan_cpr,(select ratio(marketing_budget_inr,registration_goal) from fn_targets(d))) pc,cfg.budget bu,cfg.expected_showup ex,(select count(*) from tasks t where t.campaign_id=c.cid and t.status<>'done') ot
 from c left join campaign_settings cfg on cfg.campaign_id=c.cid left join m on m.cid=c.cid left join p on p.cid is not distinct from c.cid left join r on r.cid is not distinct from c.cid left join v on v.cid is not distinct from c.cid left join h on h.cid is not distinct from c.cid)
 select cid,name,channel,owner_name,os,sp,se,pe,re,at,co,ma,ratio(sp,re),case when cid is not null then ratio(sp,at) end,ratio(ma,re),ratio(re,se),ratio(sp,sum(sp) over()),case when cid is not null then ratio(at,sum(at) filter(where cid is not null) over()) end,pc,bu,ex,ot from b$$;
create function fn_pace_share(d date) returns numeric language sql stable as $$
 with l as(select * from pace_curve where day<=d order by day desc limit 1),r as(select * from pace_curve where day>d order by day limit 1)
 select coalesce((select l.share+(r.share-l.share)*(d-l.day)/(r.day-l.day) from l,r),(select share from l),0)$$;
create function fn_kpis(d date,a text) returns table(identified bigint,regs bigint,confirmed bigint,attendees bigint,walkins bigint,spend numeric,sessions numeric,showup numeric,cpr numeric,cpa numeric,pace_share numeric,pacing numeric,projected_regs numeric,projected_attendees numeric,is_estimate boolean,identified_goal bigint,reg_goal bigint,attendee_goal bigint,budget bigint,target_version text,open_tasks bigint,reg_attainment numeric,attendee_attainment numeric,identified_attainment numeric,budget_used numeric) language sql stable as $$
 with m as materialized(select * from fn_campaign_metrics(d,a)), x as(select sum(identified)::bigint pe,sum(regs)::bigint re,sum(confirmed)::bigint co,sum(attendees)::bigint at,sum(attendees-registered_attendees)::bigint wi,sum(spend) sp,sum(sessions) se,sum(registered_attendees) ma,sum(regs*expected_showup) expected,bool_or(regs>0 and expected_showup is null) missing from m),
 e as(select (event_ends_at at time zone 'Asia/Kolkata')::date>d estimate from clean_event limit 1),s as(select fn_pace_share(d) share)
 select pe,re,co,at,wi,sp,se,ratio(ma,re),ratio(sp,re),ratio(sp,at),share,ratio(re,t.registration_goal*share),ratio(re,share),
 case when e.estimate and not x.missing then ratio(expected,share)+(select walkins from settings) when not e.estimate then at end,e.estimate,t.identified_external_people_goal,t.registration_goal,t.unique_external_visitors_goal,t.marketing_budget_inr,t.target_version,(select count(*) from tasks where status<>'done'),ratio(re,t.registration_goal),ratio(at,t.unique_external_visitors_goal),ratio(pe,t.identified_external_people_goal),ratio(sp,t.marketing_budget_inr)
 from x cross join e cross join s left join fn_targets(d) t on true$$;
create function fn_trend(d date,a text,c text default null) returns table(day date,regs bigint,spend numeric,sessions numeric,attendees bigint,cumulative numeric,cumulative_spend numeric,expected numeric,approved numeric) language sql stable as $$
 with r as(select (registered_at at time zone 'Asia/Kolkata')::date dt,count(*) n from fn_regs(d,a) where c is null or cid=c group by 1),
 m as(select activity_date dt,sum(marketing_spend_inr) n,sum(landing_page_sessions) se from clean_marketing where activity_date<=d and (c is null or campaign_id=c) group by 1),
 v as(select (first_entry at time zone 'Asia/Kolkata')::date dt,count(*) n from fn_visitors(d,a) where c is null or cid=c group by 1),
 days as(select generate_series((select min(history_start) from clean_event),d,'1 day')::date dt)
 select dt,coalesce(r.n,0),coalesce(m.n,0),coalesce(m.se,0),coalesce(v.n,0),sum(coalesce(r.n,0)) over(order by dt),sum(coalesce(m.n,0)) over(order by dt),t.registration_goal*fn_pace_share(dt),t.marketing_budget_inr::numeric from days left join r using(dt) left join m using(dt) left join v using(dt) left join lateral fn_targets(dt) t on true order by dt$$;
create function fn_weekly_campaign(d date,a text) returns table(cid text,week date,regs bigint,spend numeric,attendees bigint) language sql stable as $$
 with events as(select cid,registered_at dt,1 re,0 sp,0 att from fn_regs(d,a) union all select campaign_id,activity_date::timestamp at time zone 'Asia/Kolkata',0,marketing_spend_inr,0 from clean_marketing where activity_date<=d union all select cid,first_entry,0,0,1 from fn_visitors(d,a))
 select cid,date_trunc('week',dt at time zone 'Asia/Kolkata')::date,sum(re),sum(sp),sum(att) from events group by 1,2$$;
create function fn_alerts(d date,a text,metric text default 'cpr') returns table(cid text,actual numeric,baseline numeric,label text,reason text,weeks numeric[]) language sql stable as $$
 with w as materialized(select * from fn_weekly_campaign(d,a)), m as(select m.cid,case when metric='cpa' then m.cpa else m.cpr end actual,case when metric='cpa' then ratio(m.plan_cpr,m.expected_showup) else m.plan_cpr end base from fn_campaign_metrics(d,a) m where m.cid is not null),
 endweek as(select date_trunc('week',least(d+1,(select (event_ends_at at time zone 'Asia/Kolkata')::date+1 from clean_event))::timestamp)::date-7 last),
 x as(select m.*,s.scale,s.stop,array[ratio(w1.spend,case when metric='cpa' then w1.attendees else w1.regs end),ratio(w2.spend,case when metric='cpa' then w2.attendees else w2.regs end)] rates from m cross join settings s cross join endweek e left join w w1 on w1.cid=m.cid and w1.week=e.last-7 left join w w2 on w2.cid=m.cid and w2.week=e.last),
 y as(select x.*,case when base is null or actual is null then 'NO DATA' when rates[1]>stop*base and rates[2]>stop*base then 'STOP' when actual<=scale*base then 'SCALE' else 'CHANGE' end verdict from x)
 select cid,actual,base,verdict,case verdict when 'STOP' then 'Two consecutive completed campaign weeks above stop threshold' when 'SCALE' then 'Cumulative cost at or below scale threshold' when 'CHANGE' then 'Scale and two-week stop conditions unmet' else 'Insufficient volume or assumption' end,rates from y$$;
create function fn_simulate(d date,a text,src text,dst text,amount numeric) returns table(cid text,name text,linear_attendees numeric,delta_regs numeric,delta_attendees numeric,net_linear numeric,net_diminishing numeric,k numeric) language sql stable as $$
 with x as(select m.*,case when m.cid=src then -amount else amount end delta,case when channel='paid_social' then s.paid_k else s.k end k from fn_campaign_metrics(d,a) m cross join settings s where m.cid in(src,dst)),v as(select *,case when k=0 then 1+ratio(delta,spend) else (-(1-k)+sqrt((1-k)^2+4*k*greatest(0,1+ratio(delta,spend))))/(2*k) end mult from x where src<>dst and amount>=0 and (select count(*) from x where spend>0 and attendees>0 and regs>0 and spend+delta>=0)=2),
 y as(select cid,name,ratio(delta,cpa) lin,regs*(mult-1) dr,registered_attendees*(mult-1) da,k from v) select cid,name,lin,dr,da,sum(lin) over(),sum(da) over(),k from y
$$;

