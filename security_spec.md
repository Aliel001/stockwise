# Security Specification & "Dirty Dozen" Threat Model for StockWise

This document lists the strict security conditions, data invariants, and potential attack vectors designed to challenge our Firestore security policies.

## 1. Data Invariants
- Only verified, authenticated users can execute create, read, update, or delete actions.
- Quantities, prices, and alerting thresholds must strictly be positive values.
- Timestamp creations (`createdAt`, `updatedAt`) must strictly match `request.time`.
- Relational fields like `productId` in stock-in or sales logs must remain immutable and never be altered.

## 2. The "Dirty Dozen" Threats to Authenticity & Integrity
We must ensure that our rules prevent:
1. **Unauthenticated Read attempts on product catalog**: Reading stock levels when signed out.
2. **Identity Spoofing**: Attempting to write a log or product action as someone else by editing the `performedBy` key.
3. **Negative Quantity Inventory Poisoning**: Adding inventory or logging restocks with a negative quantity.
4. **Zero-value Purchase or Sale prices**: Making transactions for $0 or negative value.
5. **Direct Stock Override by Regular Client**: Manually updating overall product quantities on the client bypassing `stock_in` or `sales` validation workflows where applicable.
6. **State Hijacking / Timestamp Tampering**: Passing a client-side timestamp (e.g. 10 years in the past) as the `createdAt`.
7. **Deleting Transactions History**: Authenticated clients attempting to remove records from the `sales` or `stock_ins` collections to clean up history.
8. **Malicious Giant IDs**: Attempting to insert a 2MB string as a Document ID to inflate disk limits or crash queries.
9. **Modifying Immortal Fields**: Attempting to change the product ID or original author of a product during normal updates.
10. **Shadow Fields Injecting**: Attempting to create a product document containing custom fields, e.g. `isSuperAdmin: true`.
11. **Altering Activity Logs**: Attempting to overwrite past audit rows in `activity_logs`.
12. **Blanket Notification Clearance**: A client attempting to delete low-stock notifications they did not trigger or resetting read statuses wholesale.

---

## 3. Deployment Targets
The verified zero-trust security rules will be written directly inside `firestore.rules`.
