import type { ProductionPlan } from '../../types';

/**
 * The plan the demo falls back to when the language model is unavailable.
 * Written to the same standard the model is asked for: every activity names
 * the mines it applies to, and every timeline is justified against the
 * monsoon calendar. Mine names are real (GEM); the figures are synthetic.
 */
export const FALLBACK_PLAN: ProductionPlan = {
  plan_steps: [
    {
      step: 1,
      title: 'Consolidate the production record across the three belts',
      timeline: 'Week 1 – 2',
      status: 'completed',
      activities: [
        'Reconcile daily despatch tonnage against weighbridge and rail-siding records at all ten mines, starting with Joda East and Balda, where the largest volumes make small percentage errors expensive.',
        'Join IMD rainfall and soil-moisture series to the production calendar at daily resolution for the Bailadila deposits (Bacheli 5, Bacheli 10, Kirandul 11B), where monsoon rainfall is heaviest; monthly means hide the bench-flooding events entirely.',
        'Separate planned from unplanned downtime in the crusher and screening-plant logs at Katamati, Jajang and Gua, so the overhaul programme in step 4 can be costed against real unplanned loss.',
        'Record Kumaraswamy and Donimalai rainfall separately from the eastern belts. Sandur gets far less monsoon rain, and averaging it in would understate the problem everywhere else.',
      ],
    },
    {
      step: 2,
      title: 'Rank the ten mines by 30-day shortfall risk',
      timeline: 'Week 3 – 4',
      status: 'in_progress',
      activities: [
        'Fit and score the shortfall model per mine, then split the projected loss into weather-driven and equipment-driven parts. The two need different budgets and different owners.',
        'Confirm the expected result before acting on it: the Bailadila deposits and the Joda–Barbil pits (Joda East, Katamati, Balda) should lead on rainfall, while Kumaraswamy and Donimalai rank mainly on equipment.',
        'Flag every mine whose monsoon plan achievement falls more than 15 points below its dry-season achievement, and attach the rainfall threshold at which its blasting starts to slip.',
        'Publish the ranking to mine managers with the driver attribution attached, so no site is asked to fix a problem it does not have.',
      ],
    },
    {
      step: 3,
      title: 'Pre-monsoon pull-forward at the wettest pits',
      timeline: 'Week 5 – 8',
      status: 'not_started',
      activities: [
        'Advance blast rounds at Bacheli 5, Bacheli 10 and Kirandul 11B into the dry window, working the lower benches first while haul roads are still trafficable. Those benches become inaccessible first once cumulative rainfall builds.',
        'Build ROM and lump stockpiles at Joda East, Katamati and Balda sized against the July–August rail despatch commitment, so despatch is decoupled from daily production through the wet window.',
        'Complete haul-road crowning, side-drain clearing and pit-sump capacity checks at all eight eastern mines before the first week of June.',
        'Keep Kumaraswamy and Donimalai on their normal schedule. Their monsoon loss is small, so pulling production forward there buys little.',
        'Confirm contractor haulage and rake availability for the post-monsoon catch-up now, while the market is not yet competing for it.',
      ],
    },
    {
      step: 4,
      title: 'Plant overhaul programme, timed into the rain-suppressed window',
      timeline: 'Week 9 – 14',
      status: 'not_started',
      activities: [
        'Move the crusher overhauls at Katamati, Jajang and Gua into July and August. They currently fall in high-throughput dry weeks, which is the most expensive possible time to take the circuit out.',
        'Schedule screening-plant liner and deck replacement at Joda East and Balda in the same window; wet, sticky fines blind the screens during the monsoon anyway, so the plant is already running below rate.',
        'Position critical spares for the highest-downtime class at each site rather than a uniform kit: crusher liners at Katamati and Gua, loader tyres and hydraulics at the Bailadila deposits.',
        'Use the drier Sandur window differently: overhaul Kumaraswamy and Donimalai in the October–November gap, when the eastern mines are catching up and fitters are free.',
      ],
    },
    {
      step: 5,
      title: 'Workforce and logistics buffering',
      timeline: 'Week 15 – 18',
      status: 'not_started',
      activities: [
        'Pre-plan shift cover across the Diwali and Holi absenteeism windows at all ten mines. The dips are calendar-predictable, so the loss comes from unstaffed benches rather than from the absence itself.',
        'Stage contractor haulage at Bacheli 5, Bacheli 10 and Kirandul 11B for the post-monsoon catch-up, timed to the first fortnight of October when bench access returns but the despatch backlog peaks.',
        'Agree extra rake allocations for the Joda–Barbil sidings for October, so the stockpiles built in step 3 can actually be drawn down.',
        'Review the Gua and Jajang attendance record for structural rather than seasonal shortfall before committing further cover.',
      ],
    },
    {
      step: 6,
      title: 'Review, attribute and re-forecast',
      timeline: 'Week 19 – 22',
      status: 'not_started',
      activities: [
        'Compare realised output against the P10–P90 band per mine. Sustained excursions outside the band mean the model is mis-specified, not that the mine underperformed.',
        'Attribute recovered tonnage to each corrective action individually, so next season’s budget is argued from measured recovery rather than from intent.',
        'Re-fit the shortfall model on the completed season, checking whether the rainfall threshold at the Bailadila deposits has moved after the drainage work.',
        'Report the outcome to the production review with the driver attribution intact.',
      ],
    },
  ],
  risk_drivers: [
    { factor: 'Cumulative rainfall (30-day)', influence_pct: 36, direction: 'negative' },
    { factor: 'Crusher downtime', influence_pct: 20, direction: 'negative' },
    { factor: 'Blast delays', influence_pct: 18, direction: 'negative' },
    { factor: 'Equipment availability', influence_pct: 15, direction: 'positive' },
    { factor: 'Workforce attendance', influence_pct: 11, direction: 'positive' },
  ],
  projected_shortfall: { probability: 0.66, expected_gap_tonnes: 185000, horizon_days: 30 },
  corrective_actions: [
    {
      rank: 1,
      action: 'Advance blast rounds at the Bailadila deposits into the pre-monsoon window',
      driver: 'rain_cum_30',
      expected_recovery_tonnes: 92000,
      confidence: 'high',
      rationale: 'Blast holes at Bacheli 5, Bacheli 10 and Kirandul 11B flood once 30-day cumulative rainfall passes roughly 180 mm, and the executed-to-planned blast ratio falls away sharply from that point. Moving rounds into May and early June shifts tonnes out of the affected window rather than trying to recover them inside it. If this slips past the first week of June the option disappears for a year.',
    },
    {
      rank: 2,
      action: 'Reschedule the Katamati, Jajang and Gua crusher overhauls into July and August',
      driver: 'downtime_hrs_crusher',
      expected_recovery_tonnes: 54000,
      confidence: 'high',
      rationale: 'Planned crusher outages currently land in the highest-throughput dry weeks, so every hour out costs full production. Taking the same outage while the pits are already rain-limited costs a fraction of that. The constraint is fitter availability across three sites in one window, so the sequence has to be agreed before shutdown planning closes in June.',
    },
    {
      rank: 3,
      action: 'Build despatch stockpiles at Joda East, Katamati and Balda before June',
      driver: 'blast_delay_flag',
      expected_recovery_tonnes: 31000,
      confidence: 'medium',
      rationale: 'When blasting slips in the wet window, rail despatch from the Joda–Barbil sidings stalls with it. A stockpile sized to the July–August commitment keeps rakes loading while the benches are shut. It is limited by stockyard area and by the rehandling cost of wet fines.',
    },
    {
      rank: 4,
      action: 'Pre-plan shift cover across the festival absenteeism windows at all ten mines',
      driver: 'workers_present_pct',
      expected_recovery_tonnes: 18000,
      confidence: 'medium',
      rationale: 'Attendance dips around Diwali and Holi are calendar-predictable, yet they are currently absorbed as unplanned loss. The cost is unstaffed benches rather than the absence itself, so cover only has to be deep enough to keep the shovels working. Left unplanned, the same tonnage is lost every year.',
    },
  ],
};
