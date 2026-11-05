# Production Reconstruction Audit

The production reconstruction audit is maintained in the sibling `Prime-TGCloud-Checkout/docs/PRODUCTION_AUDIT.md`. Read it before modifying this sandbox. The initial audit found a mismatch between locally deleted Serverless handlers and handlers still present in the deployed TGCloud snapshot; no deployment is safe until that mismatch is resolved.
