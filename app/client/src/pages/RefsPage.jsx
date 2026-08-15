// RefsPage.jsx — data-page="refs" in the mock. Last page in the flow, no
// "continue" button (matches the mock: downloads + decision log + refs only).
// TODO: build the CSV/BIB/JSON export header, sources-used reference list,
// decision-log timeline (reuse components/DecisionLog.jsx's LogTimeline),
// and reproducibility checklist. Placeholder for now.
import PagePlaceholder from "../components/PagePlaceholder";

export default function RefsPage() {
  return (
    <PagePlaceholder
      title="Run summary"
      lede="Every decision the reviewer made, and every source it used to justify one. This is what a collaborator should be able to read instead of re-running the pipeline."
    />
  );
}
