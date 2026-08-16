// Spinner.jsx — small indeterminate circular loading indicator. No percent,
// just a ring that spins, for the "this stage takes a moment" gaps (upload
// parsing, auto-proceed's between-gate pause).
export default function Spinner({ size = "sm", className = "" }) {
  return <span className={"spinner" + (size === "lg" ? " spinner-lg" : "") + (className ? " " + className : "")} role="status" aria-label="Loading" />;
}
