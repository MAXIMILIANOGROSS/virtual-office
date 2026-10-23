/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [{ source: "/office-observatory", destination: "/oficinapublica", permanent: true }, { source: "/", destination: "/oficina", permanent: false }];
  },
  async headers() {
    return [{ source: "/:path*", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }, { key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }] }];
  },
};
export default nextConfig;
