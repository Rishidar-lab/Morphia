import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { EvidenceProvenance } from "./EvidenceProvenance";
import type { EvidenceArtifact } from "@/lib/types";

const evidence: EvidenceArtifact[] = [
  {
    id: "ev-1",
    project_id: "proj-1",
    engagement_id: "eng-1",
    run_id: "run-1",
    run_step_id: "step-1",
    creator_id: "user-1",
    source: "worker:seed",
    acquisition_timestamp: new Date().toISOString(),
    content_type: "application/json",
    original_filename: "response-headers.json",
    storage_path: "evidence/proj-1/seed.json",
    file_size: 1024,
    sha256_digest: "a".repeat(64),
    sensitivity: "standard",
    verification_status: "integrity_verified",
    reviewer_id: null,
    notes: "Test evidence",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe("EvidenceProvenance", () => {
  it("renders empty state with explanation", () => {
    renderWithProviders(<EvidenceProvenance evidence={[]} />);
    expect(screen.getByText("NO EVIDENCE YET")).toBeInTheDocument();
    expect(screen.getByText((c) => c.includes("Evidence appears here"))).toBeInTheDocument();
  });

  it("renders provenance lineage for evidence", () => {
    renderWithProviders(<EvidenceProvenance evidence={evidence} />);
    expect(screen.getAllByText("response-headers.json").length).toBeGreaterThan(0);
    expect(screen.getAllByText((c) => c.includes("SHA-256")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("integrity_verified").length).toBeGreaterThan(0);
  });

  it("shows hash and verification", () => {
    renderWithProviders(<EvidenceProvenance evidence={evidence} />);
    expect(screen.getByText("VERIFIED")).toBeInTheDocument();
    expect(screen.getByText("PROVENANCE")).toBeInTheDocument();
  });
});
