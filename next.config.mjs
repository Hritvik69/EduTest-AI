/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  outputFileTracingIncludes: {
    "/*": ["./NCERT_Books/**/_extracted_text/**/*.txt"],
    "/api/generate-paper": ["./NCERT_Books/**/_extracted_text/**/*.txt"],
  },
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
    serverActions: {
      allowedOrigins: ["localhost:3000"],
    },
  },
};

export default nextConfig;
