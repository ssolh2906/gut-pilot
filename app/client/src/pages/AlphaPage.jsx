// AlphaPage.jsx — data-page="alpha" in the mock.
// TODO: build gate G8 (significance settings) + composition chart + alpha
// dumbbell chart, using state/selectors.js (retained, belowFloor). Placeholder for now.
import PagePlaceholder from "../components/PagePlaceholder";

export default function AlphaPage() {
  return (
    <PagePlaceholder
      title="Alpha diversity"
      lede="Within-sample structure. Composition first, then the summary metrics, because the metrics are easy to over-read on their own."
      nextId="beta"
      nextLabel="Continue to beta diversity"
    />
  );
}
