# Contributing Guide

## Git Workflow

We use **Git Flow** to manage development and prevent merge conflicts.

### Branch Structure

```
main              Production-ready code, tagged releases
├─ v1.0.0
├─ v1.1.0
└─ ...

develop           Integration branch, latest development
├─ feature/query-ui
├─ feature/pdf-highlights
├─ fix/upload-bug
└─ ...
```

### Rules

1. **Protected Branches:**
   - `main` - Only merge from `develop` via PR
   - `develop` - Only merge from feature branches via PR
   
2. **Feature Branches:**
   - Branch from: `develop`
   - Naming: `feature/descriptive-name`, `fix/bug-description`, `docs/update-readme`
   - Merge to: `develop` (via PR)
   - Delete after merge

3. **Never:**
   - ❌ Commit directly to `main` or `develop`
   - ❌ Merge without PR review
   - ❌ Force push to `main` or `develop`
   - ❌ Keep stale feature branches

---

## Daily Workflow

### Starting a New Feature

```bash
# 1. Get latest code
git checkout develop
git pull origin develop

# 2. Create feature branch
git checkout -b feature/my-awesome-feature

# 3. Make changes and commit
git add .
git commit -m "feat: add awesome feature"

# 4. Push to remote
git push -u origin feature/my-awesome-feature
```

### Creating a Pull Request

1. **Push your branch** to GitHub
2. **Go to GitHub** and click "Compare & pull request"
3. **Set base branch** to `develop` (not main!)
4. **Write a clear description:**
   ```markdown
   ## What
   Brief description of the change
   
   ## Why
   Problem this solves or feature it adds
   
   ## How
   Technical approach taken
   
   ## Testing
   - [ ] Manual testing done
   - [ ] Unit tests added/updated
   - [ ] Frontend tested in browser
   - [ ] Backend tested with Swagger
   
   ## Screenshots
   (if UI changes)
   ```
5. **Assign reviewer** (other team member)
6. **Link issues** if applicable (Closes #123)

### Reviewing a Pull Request

- ✅ Check code quality and style
- ✅ Run the code locally and test
- ✅ Verify tests pass
- ✅ Check for unintended changes
- ✅ Request changes if needed
- ✅ Approve when ready
- ✅ Merge using "Squash and merge" or "Merge commit"

### After PR is Merged

```bash
# 1. Switch back to develop
git checkout develop

# 2. Pull latest (includes your merged changes)
git pull origin develop

# 3. Delete local feature branch
git branch -d feature/my-awesome-feature

# 4. Delete remote feature branch (if not auto-deleted)
git push origin --delete feature/my-awesome-feature
```

---

## Commit Message Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

- `feat:` - New feature for the user
- `fix:` - Bug fix for the user
- `docs:` - Documentation only changes
- `style:` - Formatting, missing semicolons, etc. (no code change)
- `refactor:` - Refactoring production code
- `test:` - Adding missing tests, refactoring tests
- `chore:` - Updating build tasks, package manager configs, etc.
- `perf:` - Performance improvement
- `ci:` - CI/CD changes

### Examples

```bash
feat(frontend): add document upload drag-and-drop
fix(backend): handle PDF parsing errors gracefully
docs: update README with Git workflow
refactor(query): simplify context assembly logic
test(documents): add unit tests for upload validation
chore: update dependencies to latest versions
```

### Scope (Optional)

- `frontend` / `backend` / `shared`
- Component names: `query`, `documents`, `viewer`
- File names: `chatpane`, `documentlist`

---

## Code Style

### TypeScript/React (Frontend)

```bash
# Auto-format on save (VS Code)
# Or manually:
npm run format

# Lint
npm run lint
npm run lint:fix
```

**Guidelines:**
- Use functional components with hooks
- Use TypeScript types (no `any`)
- Prefer explicit over implicit
- Use Prettier for formatting
- Use ESLint for linting

### Python (Backend)

```bash
# Format with Black
black .

# Lint with ruff
ruff check .
ruff check --fix .

# Type check with mypy (optional)
mypy .
```

**Guidelines:**
- Follow PEP 8
- Use type hints
- Docstrings for public functions
- Keep functions small and focused
- Use Black for formatting

---

## Testing

### Frontend

```bash
# Unit tests (Vitest)
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage

# E2E tests (Playwright)
npm run test:e2e
```

### Backend

```bash
# All tests
pytest

# Specific test file
pytest tests/test_documents.py

# Coverage
pytest --cov=services --cov-report=html

# Watch mode
pytest-watch
```

---

## API Contract Changes

If you need to change the API (`openapi.yaml`):

1. **Discuss with team first** - Breaking changes affect both FE and BE
2. **Update `openapi.yaml`**
3. **Update shared types** (`shared/types/`)
4. **Update backend implementation**
5. **Update frontend API client**
6. **Document in PR description**
7. **Notify team on Slack/chat**

---

## Handling Merge Conflicts

If you get conflicts when merging `develop` into your feature branch:

```bash
# 1. Update your develop
git checkout develop
git pull origin develop

# 2. Rebase your feature branch
git checkout feature/my-feature
git rebase develop

# 3. Resolve conflicts in files
# Edit conflicted files, choose the correct code

# 4. Mark as resolved
git add .
git rebase --continue

# 5. Force push (only for feature branches!)
git push --force-with-lease origin feature/my-feature
```

**Alternative: Merge instead of rebase**

```bash
git checkout feature/my-feature
git merge develop
# Resolve conflicts
git add .
git commit -m "chore: merge develop into feature branch"
git push
```

---

## Release Process (Production Deployment)

When ready to deploy to production:

1. **Create PR from `develop` → `main`**
2. **Title:** `Release v1.x.x`
3. **Description:** Changelog of features since last release
4. **Review & test thoroughly**
5. **Merge to `main`**
6. **Tag the release:**
   ```bash
   git checkout main
   git pull origin main
   git tag -a v1.0.0 -m "Release v1.0.0"
   git push origin v1.0.0
   ```
7. **Deploy** (CI/CD auto-deploys from `main`)
8. **Monitor** production for issues

---

## Getting Help

- **Questions:** Ask in team chat or daily standup
- **Code reviews:** Request detailed review in PR comments
- **Bugs:** Create GitHub issue with reproduction steps
- **Documentation:** Update as you learn, PRs welcome!

---

## Quick Reference

```bash
# Start new feature
git checkout develop && git pull && git checkout -b feature/name

# Commit changes
git add . && git commit -m "feat: description"

# Push and PR
git push -u origin feature/name
# Then create PR on GitHub: develop ← feature/name

# After merge
git checkout develop && git pull && git branch -d feature/name

# Keep feature branch updated
git checkout feature/name && git merge develop

# Check what branch you're on
git branch

# View commit history
git log --oneline --graph --all -10
```

---

**Questions? Ask the team!**
