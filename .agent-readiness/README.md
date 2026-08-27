# Agent D readiness evidence

The files in this directory are independent verification records, not implementation instructions.

`baseline-context.json`, `early-applicability-checklist.md`, `check-matrix.csv`, and `final-verification.md` document the earlier `f7e7a6c` candidate. They are retained as historical evidence only and must not be used to certify the current editorial-market P0 candidate.

The current candidate changes the source data, public response contract, UI, D1 refresh behavior, and deployment identity. Agent D must therefore issue a new explicit predeploy verdict for the final clean release-control SHA, and must perform final production verification after all approved deployment and live-integration operations finish. The applicable truth gate requires:

- heat derived only from cited primary editorial markets;
- documented outlet market, or validated outlet language plus publisher location, with method and confidence;
- event location, publisher origin, and audience/readership never substituted for editorial market;
- outlet editions counted as outlets while conflict requires independent publisher networks;
- the composed production refresh replaces the superseded run atomically and passes foreign-key integrity;
- live REST, MCP, A2A, UI, discovery, HTTPS, and security behavior match the frozen candidate.
