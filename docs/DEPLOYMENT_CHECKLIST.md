# Deployment Checklist

## Pre-Migration

- [ ] Ensure `.env` file exists with `DATABASE_URL` set
- [ ] Backup database (optional): `pg_dump $DATABASE_URL > backup.sql`
- [ ] Review `infra/migrations/README.md` for details

## Apply Migration

- [ ] Run `./ops/scripts/apply_migration.sh`
- [ ] Verify migration succeeded (should show "paper_bankroll is now a VIEW")
- [ ] Check data integrity passes all 5 checks

## Testing

- [ ] Test trading agent: `make trade`
  - Should execute without errors
  - Check that trades are inserted correctly
  - Verify balance updates automatically

- [ ] Test dashboard: `make dashboard`
  - Visit http://localhost:3001
  - Check Overview page shows correct balance
  - Verify active positions display
  - Check recent trades appear

- [ ] Run manual verification:
  ```bash
  python ops/scripts/verify_data_integrity.py
  ```
  - All 5 checks should pass

## Commit Changes

- [ ] Review changes: `git status`
- [ ] Stage all files: `git add .`
- [ ] Commit with message:
  ```bash
  git commit -m "Fix: Replace paper_bankroll table with dynamic view

  - Eliminates data inconsistencies by calculating balance from paper_trades
  - Removes manual balance update logic (single source of truth)
  - Adds data integrity verification script
  - Updates CLAUDE.md with architectural principles
  - Deletes hardcoded fix_bankroll.sql (no longer needed)"
  ```
- [ ] Push to remote: `git push`

## Post-Deployment

- [ ] Monitor first few trades to ensure balance updates correctly
- [ ] Check dashboard continues to show accurate data
- [ ] Verify no errors in application logs

## Rollback (if needed)

If something goes wrong:

1. Restore backup (if created):
   ```bash
   psql $DATABASE_URL < backup.sql
   ```

2. Or rollback migration (see MIGRATION_NOTES.md "Rollback" section)

## Success Criteria

✅ Migration applied successfully
✅ All integrity checks pass
✅ Trading agent works without errors
✅ Dashboard displays correct balance
✅ Balance updates automatically on trades
✅ No manual fixes needed

## Notes

- `paper_bankroll` is now a VIEW (read-only)
- Balance calculated from `paper_trades` on every query
- Impossible to drift out of sync
- No more hardcoded fixes needed!

---

**Estimated time:** 5-10 minutes
**Risk level:** Low (can rollback if needed)
**Status:** Ready for deployment
