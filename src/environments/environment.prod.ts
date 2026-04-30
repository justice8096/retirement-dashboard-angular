export const environment = {
  production: true,
  apiBaseUrl: '/api',
  // Clerk publishable key — public by design (sent to the browser).
  // Same instance as the api's CLERK_PUBLISHABLE_KEY env var. When you
  // rotate Clerk instances or move to a production tier, update this value
  // and the api's env in lockstep.
  clerkPublishableKey: 'pk_test_bWludC1zbmFrZS0yMi5jbGVyay5hY2NvdW50cy5kZXYk',
};
