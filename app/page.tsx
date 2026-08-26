import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-4 text-5xl font-bold text-white">RE:ACT</h1>
        <p className="mb-8 text-xl text-slate-300">
          Emergency Intelligence & Coordination Platform
        </p>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full rounded-lg bg-red-600 px-6 py-3 font-semibold text-white transition hover:bg-red-700"
          >
            Sign In
          </Link>
          <p className="text-sm text-slate-400">
            v0.1.0 — Milestone 1 Foundation
          </p>
        </div>
      </div>
    </main>
  )
}
