/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // next/image is not used: turn the /_next/image optimizer off so it is not exposed.
  images: { unoptimized: true },
};
export default nextConfig;
