// Shared puzzles are public: a /share/:code link must open without a parent
// login even when Firebase auth is enabled (it renders under LearnerProvider as
// 'local' but never reads or records learner state). Every other route is gated
// when Firebase auth is on and nobody is signed in.
export function shouldGateForAuth(enabled: boolean, hasUser: boolean, pathname: string): boolean {
  if (pathname.startsWith('/share/')) return false
  return enabled && !hasUser
}
