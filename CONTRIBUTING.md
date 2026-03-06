# Contributing to AgilePlanner

Thank you for your interest in contributing to AgilePlanner! We welcome contributions from the community and are committed to maintaining high-quality code and documentation.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/agileprocess-planner.git
   cd agileprocess-planner
   ```
3. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Install dependencies**:
   ```bash
   npm install
   ```

## Development Workflow

### 1. Write Your Code
- Ensure your code follows TypeScript best practices
- Add appropriate JSDoc comments for public APIs
- Keep functions focused and testable

### 2. Write Tests
- Add tests for any new functionality
- Run tests to ensure they pass:
  ```bash
  npm test
  ```
- Aim for high code coverage in your changes

### 3. Build the Project
- Verify your changes compile correctly:
  ```bash
  npm run build
  ```

### 4. Commit Your Changes
- Write descriptive commit messages following conventional commits:
  ```
  feat: add new feature
  fix: resolve issue with component
  docs: update README
  ```

### 5. Push and Create a Pull Request
- Push your feature branch:
  ```bash
  git push origin feature/your-feature-name
  ```
- Create a Pull Request on GitHub with a clear description

## Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read and adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

### Core Principles
- **Respectful collaboration**: Treat all contributors with respect
- **Open communication**: Discuss ideas and concerns openly and constructively
- **Inclusive environment**: Welcome diverse perspectives and backgrounds
- **Professional conduct**: Keep discussions focused on the project

## Intellectual Property

### Contributor License Agreement
By submitting a pull request, you agree that:

1. **Your contributions are your own** - You own the intellectual property rights to your contributions
2. **License grant** - You grant AgilePlanner and its users a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable license to use your contributions
3. **Third-party content** - You ensure your contributions do not include code or content from third parties without proper attribution and licensing
4. **No additional restrictions** - You will not place any additional restrictions on the use of your contributions

### Copyright Notice
All contributions are made under the terms of the MIT License. The copyright of your contributions remains with you, but you grant the project and its users the rights specified in the MIT License.

## Third-Party Libraries

When using third-party libraries or code:
- Ensure they have permissive open-source licenses (MIT, Apache 2.0, BSD, etc.)
- Include proper attribution in source files
- Update the THIRD_PARTY_LICENSES file with the library details
- Include the original license text in the repository

## Pull Request Process

1. **Update documentation** if your changes affect functionality
2. **Add tests** for new features or bug fixes
3. **Ensure CI/CD passes** - All tests and checks must pass
4. **Request review** from maintainers
5. **Address feedback** from reviewers
6. **Get approval** before merging

## Code Style Guidelines

- Use TypeScript for all source code
- Follow the existing code style and conventions
- Use `prettier` for code formatting:
  ```bash
  npm run format
  ```
- Use `eslint` for linting:
  ```bash
  npm run lint
  ```

### Naming Conventions
- **Files**: Use kebab-case for file names (e.g., `azure-devops-client.ts`)
- **Classes**: Use PascalCase (e.g., `AzureDevOpsClient`)
- **Functions/variables**: Use camelCase (e.g., `getSprintItems`)
- **Constants**: Use UPPER_SNAKE_CASE (e.g., `DEFAULT_TIMEOUT`)

## Testing Requirements

- Write unit tests for all new functions
- Aim for >80% code coverage
- Test both happy paths and error cases
- Mock external dependencies (API calls, file system, etc.)

Example test structure:
```typescript
describe('featureName', () => {
  it('should do something when condition is met', () => {
    // Arrange
    const input = setupData();
    
    // Act
    const result = functionUnderTest(input);
    
    // Assert
    expect(result).toEqual(expectedOutput);
  });
});
```

## Commit Message Conventions

Use the following format for commit messages:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring without feature changes
- `perf`: Performance improvements
- `test`: Test-related changes
- `chore`: Build process, dependencies, or tooling

### Example
```
feat(sprint-handler): add ability to batch create sprint items

This allows creating multiple sprint items in a single operation,
improving performance when dealing with large backlogs.

Closes #123
```

## Security Policy

If you discover a security vulnerability, please email `security@example.com` instead of using the issue tracker. We take security seriously and will investigate all reported issues promptly.

## Reporting Issues

Before creating an issue, please:
1. Check existing issues to avoid duplicates
2. Use clear, descriptive titles
3. Provide steps to reproduce for bugs
4. Include relevant error messages and logs
5. Specify your environment (OS, Node.js version, etc.)

## Questions?

- Open an issue labeled `question`
- Check our documentation in the README
- Review existing issues and discussions

## Recognition

We recognize all contributors! Your contributions will be:
- Listed in the project README
- Acknowledged in release notes
- Valued in our community

Thank you for helping make AgilePlanner better! 🎉
