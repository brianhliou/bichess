export function buildI18nReport(domains, supportedLocales) {
  const errors = [];
  const localeNames = supportedLocales.filter((locale) => locale !== 'en');
  const owners = new Map();
  const domainNames = new Set();
  const totals = {
    sourceKeys: 0,
    criticalKeys: 0,
    locales: Object.fromEntries(localeNames.map((locale) => [locale, emptyLocaleSummary()])),
  };

  if (!supportedLocales.includes('en')) {
    errors.push(error('missing-source-locale', 'Supported locales must include en.'));
  }

  const domainReports = domains.map((domain) => {
    if (domainNames.has(domain.name)) {
      errors.push(
        error('duplicate-domain', `Domain ${domain.name} is declared more than once.`, domain),
      );
    }
    domainNames.add(domain.name);

    const sourceKeys = Object.keys(domain.english).sort();
    const criticalKeys = [...domain.critical];
    const criticalSet = new Set(criticalKeys);
    const criticalOwners = new Set();

    totals.sourceKeys += sourceKeys.length;
    totals.criticalKeys += criticalKeys.length;

    for (const key of sourceKeys) {
      const previousOwner = owners.get(key);
      if (previousOwner) {
        errors.push(
          error(
            'duplicate-source-key',
            `${key} is owned by both ${previousOwner} and ${domain.name}.`,
            domain,
            undefined,
            key,
          ),
        );
      } else {
        owners.set(key, domain.name);
      }

      if (String(domain.english[key]).trim() === '') {
        errors.push(
          error(
            'empty-source',
            `${domain.name}:${key} has an empty English value.`,
            domain,
            undefined,
            key,
          ),
        );
      }

      if (domain.prefixes && !domain.prefixes.includes(key.split('.')[0])) {
        errors.push(
          error(
            'prefix-mismatch',
            `${domain.name}:${key} does not match an owned prefix.`,
            domain,
            undefined,
            key,
          ),
        );
      }
    }

    for (const key of criticalKeys) {
      if (criticalOwners.has(key)) {
        errors.push(
          error(
            'duplicate-critical-key',
            `${domain.name}:${key} is listed as critical more than once.`,
            domain,
            undefined,
            key,
          ),
        );
      }
      criticalOwners.add(key);
      if (!(key in domain.english)) {
        errors.push(
          error(
            'unknown-critical-key',
            `${domain.name}:${key} is critical but has no English source.`,
            domain,
            undefined,
            key,
          ),
        );
      }
    }

    for (const locale of Object.keys(domain.locales)) {
      if (!localeNames.includes(locale)) {
        errors.push(
          error(
            'unsupported-locale-catalog',
            `${domain.name} contains a catalog for unsupported locale ${locale}.`,
            domain,
            locale,
          ),
        );
      }
    }

    const locales = {};
    for (const locale of localeNames) {
      const catalog = domain.locales[locale];
      if (!catalog) {
        errors.push(
          error(
            'missing-locale-catalog',
            `${domain.name} has no catalog for supported locale ${locale}.`,
            domain,
            locale,
          ),
        );
      }

      const translations = catalog ?? {};
      const staleKeys = Object.keys(translations)
        .filter((key) => !(key in domain.english))
        .sort();
      const emptyKeys = Object.keys(translations)
        .filter((key) => String(translations[key]).trim() === '')
        .sort();
      const missingKeys = sourceKeys.filter(
        (key) => translations[key] === undefined || String(translations[key]).trim() === '',
      );
      const missingCriticalKeys = missingKeys.filter((key) => criticalSet.has(key));
      const translated = sourceKeys.length - missingKeys.length;
      const criticalTranslated = criticalKeys.length - missingCriticalKeys.length;

      for (const key of staleKeys) {
        errors.push(
          error(
            'stale-locale-key',
            `${domain.name}:${locale}:${key} has no English source.`,
            domain,
            locale,
            key,
          ),
        );
      }
      for (const key of emptyKeys) {
        errors.push(
          error(
            'empty-translation',
            `${domain.name}:${locale}:${key} has an empty translation.`,
            domain,
            locale,
            key,
          ),
        );
      }
      for (const key of missingCriticalKeys) {
        errors.push(
          error(
            'missing-critical-translation',
            `${domain.name}:${locale}:${key} is critical and untranslated.`,
            domain,
            locale,
            key,
          ),
        );
      }

      locales[locale] = {
        translated,
        missing: missingKeys.length,
        noncriticalMissing: missingKeys.length - missingCriticalKeys.length,
        coveragePercent: percentage(translated, sourceKeys.length),
        criticalTranslated,
        criticalMissing: missingCriticalKeys.length,
        missingKeys,
        missingCriticalKeys,
        staleKeys,
      };

      const total = totals.locales[locale];
      total.translated += translated;
      total.missing += missingKeys.length;
      total.noncriticalMissing += missingKeys.length - missingCriticalKeys.length;
      total.criticalTranslated += criticalTranslated;
      total.criticalMissing += missingCriticalKeys.length;
    }

    return {
      name: domain.name,
      sourceKeys: sourceKeys.length,
      criticalKeys: criticalKeys.length,
      locales,
    };
  });

  for (const locale of localeNames) {
    totals.locales[locale].coveragePercent = percentage(
      totals.locales[locale].translated,
      totals.sourceKeys,
    );
  }

  return {
    ok: errors.length === 0,
    policy: {
      sourceLocale: 'en',
      enforced: 'catalog structure and critical translations',
      informational: 'noncritical translation gaps',
    },
    supportedLocales: [...supportedLocales],
    outreachLocales: localeNames,
    domains: domainReports,
    totals,
    errors,
  };
}

export function formatI18nReport(report) {
  const localeHeadings = report.outreachLocales.map((locale) => locale.padEnd(22));
  const lines = [
    '# app translation coverage',
    `supported locales: ${report.supportedLocales.join(', ')}`,
    '',
    ['domain'.padEnd(12), 'source'.padStart(6), 'critical'.padStart(10), ...localeHeadings].join(
      '  ',
    ),
  ];

  for (const domain of report.domains) {
    lines.push(
      [
        domain.name.padEnd(12),
        String(domain.sourceKeys).padStart(6),
        String(domain.criticalKeys).padStart(10),
        ...report.outreachLocales.map((locale) => formatLocaleCell(domain.locales[locale])),
      ].join('  '),
    );
  }

  lines.push(
    [
      'TOTAL'.padEnd(12),
      String(report.totals.sourceKeys).padStart(6),
      String(report.totals.criticalKeys).padStart(10),
      ...report.outreachLocales.map((locale) => formatLocaleCell(report.totals.locales[locale])),
    ].join('  '),
  );

  const gapCounts = report.outreachLocales.map(
    (locale) => `${locale} ${report.totals.locales[locale].noncriticalMissing}`,
  );
  lines.push('', `noncritical gaps are informational: ${gapCounts.join(', ')}`);

  if (report.errors.length > 0) {
    lines.push('', `i18n:check: failed (${report.errors.length} error(s))`);
    for (const item of report.errors) lines.push(`  [${item.code}] ${item.message}`);
  } else {
    lines.push('', 'i18n:check: ok');
  }

  return lines.join('\n');
}

function emptyLocaleSummary() {
  return {
    translated: 0,
    missing: 0,
    noncriticalMissing: 0,
    coveragePercent: 100,
    criticalTranslated: 0,
    criticalMissing: 0,
  };
}

function percentage(translated, total) {
  return total === 0 ? 100 : Math.round((translated / total) * 1000) / 10;
}

function formatLocaleCell(summary) {
  const coverage = `${summary.translated}/${summary.translated + summary.missing} ${summary.coveragePercent}%`;
  const critical = `critical ${summary.criticalTranslated}/${summary.criticalTranslated + summary.criticalMissing}`;
  return `${coverage}, ${critical}`.padEnd(22);
}

function error(code, message, domain, locale, key) {
  return {
    code,
    message,
    ...(domain ? { domain: domain.name } : {}),
    ...(locale ? { locale } : {}),
    ...(key ? { key } : {}),
  };
}
