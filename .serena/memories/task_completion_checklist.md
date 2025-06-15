# Task Completion Checklist

When completing a task in the MT63 WASM project, ensure:

## Code Quality
- [ ] TypeScript code compiles without errors (`npm run build`)
- [ ] Native code compiles without errors (`npm run build_native`)
- [ ] No TypeScript type errors or warnings
- [ ] Code follows project conventions and style

## Testing
- [ ] Run test suite: `npm test`
- [ ] All existing tests pass
- [ ] Add new tests for new functionality when appropriate
- [ ] Manual testing with test.html if UI changes made

## Build Verification
- [ ] Full build succeeds: `npm run build_all`
- [ ] Generated WASM file is valid
- [ ] TypeScript compilation produces valid JavaScript
- [ ] Dist folder contains all necessary files

## Documentation
- [ ] Update inline code comments as needed
- [ ] Update TypeScript interfaces/types if API changed
- [ ] No documentation files created unless explicitly requested

## Git Workflow
- [ ] Stage relevant changes: `git add`
- [ ] Commit with descriptive message
- [ ] Check git status is clean
- [ ] No sensitive information committed

## Production Readiness
- [ ] Consider switching CMakeLists.txt to release mode if needed
- [ ] Verify package.json version if publishing