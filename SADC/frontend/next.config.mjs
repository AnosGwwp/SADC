/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // One page that talks to the SADC backend from the browser, so it builds to plain files in out/
  // that any static host (Netlify, Vercel, Caddy on the VPS) can serve.
  output: "export",
};

export default nextConfig;
