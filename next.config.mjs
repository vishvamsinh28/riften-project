/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Blocking metadata for every user agent: generateMetadata existence checks
  // (traces/[id]) must resolve BEFORE streaming so dead links get a real 404
  // status instead of a streamed 200 shell. Data is in-memory, so the
  // blocking cost is negligible.
  htmlLimitedBots: /.*/,
};

export default nextConfig;
