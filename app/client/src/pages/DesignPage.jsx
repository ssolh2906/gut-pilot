// DesignPage.jsx — data-page="design" in the mock.
// TODO: build gates G1-G3 (group definition, batch effects, sample
// independence) + G4 (taxonomic rank) per docs/gates.md. Placeholder for now.
import PagePlaceholder from "../components/PagePlaceholder";

export default function DesignPage() {
  return (
    <PagePlaceholder
      title="Study design"
      lede="What is actually being compared. Nothing downstream means anything until this is right, so the reviewer proposes and you confirm."
      nextId="qc"
      nextLabel="Confirm design and continue"
    />
  );
}
