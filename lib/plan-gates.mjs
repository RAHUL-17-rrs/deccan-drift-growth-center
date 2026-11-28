// Plan gates store raw workbook values (registrations, rupees, attendees or a share) with an
// optional multiplier that sets the trigger point. These helpers give both the UI and the copilot
// one readable rendering.
const whole = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function gateUnit(name = "", rule = "") {
  const text = (name + " " + rule).toLowerCase();
  if (/holdback|share of/.test(text)) return "share";
  if (/cost|₹|sponsor/.test(text)) return "rupees";
  if (/pace|registrations/.test(text)) return "registrations";
  if (/attendee|entry/.test(text)) return "attendees";
  return "number";
}

export function formatGateValue(value, unit) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (unit === "share") return (n * 100).toFixed(1).replace(/\.0$/, "") + "%";
  if (unit === "rupees") return "₹" + whole.format(n);
  if (unit === "registrations") return whole.format(n) + " registrations";
  if (unit === "attendees") return whole.format(n) + " projected attendees";
  return whole.format(n);
}

/** The value at which the gate fires, or null when the multiplier is 1 (the value itself). */
export function gateTrigger(gate) {
  const multiplier = Number(gate.multiplier ?? 1);
  if (!Number.isFinite(multiplier) || multiplier === 1) return null;
  const unit = gateUnit(gate.name, gate.rule);
  return formatGateValue(Number(gate.value) * multiplier, unit) +
    " (" + whole.format(multiplier * 100) + "% of " + formatGateValue(gate.value, unit) + ")";
}

export function describeGate(gate) {
  const unit = gateUnit(gate.name, gate.rule);
  const trigger = gateTrigger(gate);
  return gate.name + (gate.timing ? ", " + gate.timing : "") + " · " + gate.rule + ": " +
    formatGateValue(gate.value, unit) +
    (trigger ? ", so the gate triggers at " + formatGateValue(Number(gate.value) * Number(gate.multiplier), unit) : "");
}
