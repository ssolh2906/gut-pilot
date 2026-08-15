// DaPage.jsx — data-page="da" in the mock.
// TODO: build gate G10 (prevalence filter) + volcano plot + known-taxa
// cross-check + artifact warnings, using DA_TAXA/DA_CLOUD + adjustedP/sigCount
// from state/selectors.js. Note: there's no backend implementation (real or
// stubbed) behind differential abundance yet — build fully against the mock
// data in lib/data.js and mark it clearly as mock-backed. Placeholder for now.
import PagePlaceholder from "../components/PagePlaceholder";

export default function DaPage() {
  return (
    <PagePlaceholder
      title="Differential abundance and review"
      lede="Where the CRC signal actually lives. Consensus across three methods, then a literature cross-check, then the artifact scan."
      nextId="refs"
      nextLabel="View run summary"
    />
  );
}
