import test from "node:test";
import assert from "node:assert/strict";
process.env.GROWTH_TEST = "1";
const { seed } = await import("../scripts/seed.mjs");
const { sql, rows, scalar } = await import("../lib/db.mjs");
const dates = [
  ["2025-02-15", 1055, 587, 426, 30, 16, 115, 73475, 0, "launch"],
  ["2025-03-01", 1658, 1144, 935, 78, 36, 95, 135350, 0, "launch"],
  ["2025-03-14", 2329, 1506, 1255, 106, 48, 97, 189575, 0, "launch"],
  ["2025-03-15", 2393, 1562, 1279, 107, 48, 128, 189575, 0, "revised"],
  ["2025-04-11", 3500, 2800, 2500, 183, 88, 29, 276500, 0, "revised"],
  ["2025-04-20", 3625, 2800, 2500, 183, 88, 29, 274000, 2050, "revised"],
];
const channels = [
  ["C01", 42000, 520, 390, 3685, 75, 81, 108],
  ["C02", 93000, 680, 340, 5282, 50, 137, 274],
  ["C03", 59000, 350, 175, 4066, 50, 169, 337],
  ["C04", 31000, 450, 385, 5246, 85.6, 69, 81],
  ["C05", 19000, 350, 275, 2575, 78.6, 54, 69],
  ["C06", 14000, 250, 195, 1893, 78, 56, 72],
  ["C07", 16000, 200, 165, 1898, 82.5, 80, 97],
];
const final = "'2025-04-20','registration'";
async function answerKey(t) {
  for (const [
    date,
    people,
    regs,
    confirmed,
    cancelled,
    waitlisted,
    interested,
    spend,
    attendees,
    version,
  ] of dates) {
    await t.test("Snapshot " + date, async () => {
      const k = await scalar(
        "select * from fn_kpis('" + date + "','registration')",
      );
      assert.deepEqual(
        [k.identified, k.regs, k.confirmed, k.spend, k.attendees],
        [people, regs, confirmed, spend, attendees],
      );
      assert.ok(k.target_version.includes(version));
      const mix = await rows(
        "select status,count(*) n from fn_status('" +
          date +
          "','registration') group by 1",
      );
      assert.deepEqual(Object.fromEntries(mix.map((x) => [x.status, x.n])), {
        confirmed,
        cancelled,
        waitlisted,
        interested,
      });
      if (date === "2025-03-01") {
        assert.equal(Math.round(k.pacing * 100), 102);
        assert.equal(+(k.reg_attainment * 100).toFixed(1), 40.9);
      }
      if (date === "2025-04-20") {
        assert.deepEqual(
          [k.walkins, k.reg_goal, k.attendee_goal, k.identified_goal, k.budget],
          [125, 3200, 2200, 3600, 300000],
        );
        assert.deepEqual(
          [
            k.reg_attainment,
            k.attendee_attainment,
            k.identified_attainment,
            k.budget_used,
            k.showup,
          ].map((x) => +(x * 100).toFixed(1)),
          [87.5, 93.2, 100.7, 91.3, 68.8],
        );
        assert.deepEqual([Math.round(k.cpr), Math.round(k.cpa)], [98, 134]);
      }
    });
  }
  await t.test("Seven campaign benchmarks and walk-ins", async () => {
    const m = await rows(
      "select * from fn_campaign_metrics(" + final + ") order by cid",
    );
    assert.deepEqual(
      m
        .slice(0, 7)
        .map((x) => [
          x.cid,
          x.spend,
          x.regs,
          x.attendees,
          x.sessions,
          +(x.showup * 100).toFixed(1),
          Math.round(x.cpr),
          Math.round(x.cpa),
        ]),
      channels,
    );
    assert.equal(m[7].attendees, 125);
  });
  await t.test("Admission days, sources, and repeat visitors", async () => {
    const x = await rows(
      "select occurred_at::date dt,count(distinct person_id) n from fn_entries(" +
        final +
        ") group by 1 order by 1",
    );
    assert.deepEqual(
      x.map((r) => r.n),
      [1430, 1345],
    );
    assert.equal(x[0].n + x[1].n - 2050, 725);
    const s = await rows(
      "select source,count(*) n from fn_entries(" +
        final +
        ") group by 1 order by 1",
    );
    assert.deepEqual(
      s.map((x) => x.n),
      [305, 2945],
    );
  });
  await t.test("Owner totals, peak week, engagement events", async () => {
    assert.deepEqual(
      (
        await rows(
          "select owner_name,count(*) n from fn_regs(" +
            final +
            ") group by 1 order by 1",
        )
      ).map((x) => x.n),
      [930, 350, 970, 550],
    );
    const peak = await scalar(
      "select date_trunc('week',registered_at)::date week,count(*) n from fn_regs(" +
        final +
        ") group by 1 order by n desc limit 1",
    );
    assert.deepEqual(peak, { week: "2025-03-24", n: 354 });
    const counts = await rows(
      "select event_type,count(*) n from clean_engagement group by 1 order by 1",
    );
    assert.deepEqual(
      Object.fromEntries(counts.map((x) => [x.event_type, x.n])),
      {
        page_visit: 3500,
        registration_start: 3075,
        brochure_download: 1818,
        nurture_email_sent: 1400,
        nurture_email_opened: 992,
        nurture_email_clicked: 409,
        opted_out: 229,
        event_question_submitted: 227,
      },
    );
  });
  await t.test("Import retries and credits", async () => {
    for (const [name, count, duplicates] of [
      ["marketing", 483, 2],
      ["history", 5911, 4],
      ["checkins", 3390, 20],
    ]) {
      assert.equal(
        Number(await sql("select count(*) from raw_" + name)),
        count,
      );
      assert.equal(
        Number(await sql("select count(*) from clean_" + name)),
        count - duplicates,
      );
    }
    assert.equal(
      await sql(
        "select count(*)||','||sum(marketing_spend_inr) from clean_marketing where marketing_spend_inr<0",
      ),
      "4,-6500",
    );
  });
}
test("Original workbook and reset", async (t) => {
  await seed();
  await t.test("Fresh import", answerKey);
  const before = await scalar("select * from fn_kpis(" + final + ")");
  await sql(
    "delete from raw_checkins where event_id in(select event_id from clean_checkins where campaign_id='C02' and result='admitted' and verification='verified' order by event_id limit 50)",
  );
  assert.ok(
    (await scalar("select * from fn_kpis(" + final + ")")).attendees <
      before.attendees,
  );
  await seed();
  await t.test("After reset", answerKey);
  const sim = await rows(
    "select * from fn_simulate(" + final + ",'C02','C05',20000)",
  );
  assert.ok(Math.abs(sim[0].net_diminishing - 120) < 2);
});
