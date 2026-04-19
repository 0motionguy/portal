/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // @visitportal/spec ships TypeScript sources (no prebuilt dist). Next.js
  // needs to transpile them at build time so the lean validator can run
  // inside API routes and server components.
  transpilePackages: ["@visitportal/spec"],
};

export default nextConfig;
