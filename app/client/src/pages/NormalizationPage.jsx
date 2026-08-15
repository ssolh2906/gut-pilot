// NormalizationPage.jsx — data-page="rarefy" in the mock (id kept as "rarefy"
// to match lib/pages.js / state/store.js; only the file/component name is
// changed to match the page's actual title/tab label, "Normalization"/"Normalize").
// TODO: build gate G6 (normalization strategy) + rarefaction curves/debate
// per docs/gates.md. Remember: in CSS/CLR mode there's only one reveal step
// (the debate panel), so that path should skip the reveal gate entirely and
// show it on load, same as QcPage's depth chart.
import PagePlaceholder from "../components/PagePlaceholder";

export default function NormalizationPage() {
  return (
    <PagePlaceholder
      title="Normalization"
      lede="The literature genuinely splits here, so this page argues both sides before you pick. Everything downstream inherits the choice."
      nextId="alpha"
      nextLabel="Approve and compute"
    />
  );
}
