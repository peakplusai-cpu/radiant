/** When the build has no database, render on request so an empty prerender is not cached. */
export async function dynamicWithoutDatabase(): Promise<void> {
  if (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  const { connection } = await import("next/server");
  await connection();
}
