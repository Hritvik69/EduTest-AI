import { jsonSuccess, requireAuthenticatedUser } from "@/lib/api-security";

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) return auth.response;

  return jsonSuccess({
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name ?? (auth.user.isGuest ? "Guest" : "User"),
      image: auth.user.image ?? null,
      isGuest: Boolean(auth.user.isGuest),
    },
  });
}
