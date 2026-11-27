export default {
  poweredByHeader: false,
  devIndicators: false,
  experimental: { cpus: 2 },
  // Files read at runtime with fs (reset/seed and workbook downloads).
  outputFileTracingIncludes: {
    "/api/[action]": ["./sql/**/*", "./*.xlsx"],
  },
};
