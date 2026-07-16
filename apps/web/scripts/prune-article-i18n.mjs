// Remove article dictionary entries whose English source string no longer
// exists anywhere in the article catalog. Coverage tests prevent new orphans;
// this command is the mechanical cleanup path after English copy changes.
import { promises as fs } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import ts from 'typescript';
import { createServer } from 'vite';

const window = new Window();
globalThis.window = window;
globalThis.document = window.document;

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(__dirname, '..', 'src', 'article-i18n.ts');
const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { articles } = await server.ssrLoadModule('/src/articles-data.ts');
  const { articleTranslationSourceStrings } = await server.ssrLoadModule('/src/article-prose.ts');
  const { ARTICLE_LANGS, translationKeys } = await server.ssrLoadModule('/src/article-i18n.ts');
  const liveStrings = articleTranslationSourceStrings(articles);

  const orphanKeys = new Set(
    ARTICLE_LANGS.flatMap((lang) => translationKeys(lang).filter((key) => !liveStrings.has(key))),
  );
  if (orphanKeys.size === 0) {
    console.log('article translations already clean: 0 orphaned source strings');
    process.exitCode = 0;
  } else {
    const source = await fs.readFile(sourcePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      sourcePath,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const dictionaryNames = new Set(['ZH_HANS', 'ZH_HANT']);
    const removals = [];

    for (const statement of sourceFile.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !dictionaryNames.has(declaration.name.text)) {
          continue;
        }
        if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
          throw new Error(`${declaration.name.text} must remain an object literal`);
        }
        for (const property of declaration.initializer.properties) {
          if (!ts.isPropertyAssignment(property)) continue;
          const name = property.name;
          const key =
            ts.isStringLiteralLike(name) || ts.isIdentifier(name)
              ? name.text
              : name.getText(sourceFile);
          if (!orphanKeys.has(key)) continue;
          const commaEnd = source[property.end] === ',' ? property.end + 1 : property.end;
          removals.push({ start: property.getFullStart(), end: commaEnd, key });
        }
      }
    }

    const foundKeys = new Set(removals.map((entry) => entry.key));
    const missingFromSource = [...orphanKeys].filter((key) => !foundKeys.has(key));
    if (missingFromSource.length > 0) {
      throw new Error(`could not locate ${missingFromSource.length} orphaned key(s) in source`);
    }

    let updated = source;
    for (const removal of removals.sort((a, b) => b.start - a.start)) {
      updated = updated.slice(0, removal.start) + updated.slice(removal.end);
    }
    await fs.writeFile(sourcePath, updated, 'utf-8');
    console.log(
      `pruned ${orphanKeys.size} orphaned source string(s) across ${removals.length} dictionary entries`,
    );
  }
} finally {
  await server.close();
}
