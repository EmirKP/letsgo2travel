import { getWorld, healthCheck } from "workflow/runtime";
import { isAuthorizedPriceAlertCron } from "@/lib/price-alert-cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = {"Cache-Control":"private, no-store, max-age=0"};

/** Diagnostic queue round trip only: this route never starts the price scan. */
export async function GET(request: Request) {
  if (!isAuthorizedPriceAlertCron(request)) return Response.json({error:"Unauthorized"},{status:401,headers});
  try {
    const result = await healthCheck(await getWorld(), {timeout:20_000});
    if (!result.healthy) return Response.json({healthy:false,error:"Workflow queue verification failed."},{status:503,headers});
    return Response.json({healthy:true,latencyMs:result.latencyMs,specVersion:result.specVersion,workflowCoreVersion:result.workflowCoreVersion},{headers});
  } catch {
    return Response.json({healthy:false,error:"Workflow queue verification failed."},{status:503,headers});
  }
}
