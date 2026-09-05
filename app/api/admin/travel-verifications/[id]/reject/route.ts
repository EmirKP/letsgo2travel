import { reviewVerification } from "@/lib/verification-review";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return reviewVerification(request, (await params).id, "reject");
}
