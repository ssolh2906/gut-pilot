// BetaPage.jsx — data-page="beta" in the mock.
// TODO: build gate G9 (distance metric) + PCoA scatter + distance-matrix
// heatmap per docs/gates.md. Placeholder for now.
import PagePlaceholder from "../components/PagePlaceholder";

export default function BetaPage() {
  return (
    <PagePlaceholder
      title="Beta diversity"
      lede="Between-sample structure. Ordination and the raw distance matrix, so the statistic and the picture can be checked against each other."
      nextId="da"
      nextLabel="Continue to differential abundance"
    />
  );
}
