import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import {
  applyCampaign,
  createCampaign,
  listActiveCampaigns,
} from "../../modules/campaign.js";
import { errorResponses } from "../schemas/common.js";

const CampaignSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.number(),
    start_date: z.string(),
    end_date: z.string(),
    active: z.number().int(),
  })
  .openapi("Campaign");

const CreateCampaignRequestSchema = z
  .object({
    name: z.string().min(1),
    discount_type: z.enum(["percentage", "fixed"]),
    discount_value: z.number().positive(),
    start_date: z.string(),
    end_date: z.string(),
  })
  .openapi("CreateCampaignRequest");

const ApplyCampaignResponseSchema = z
  .object({
    order_id: z.string(),
    campaign_id: z.string(),
    original_amount: z.number(),
    discount_amount: z.number(),
    final_amount: z.number(),
  })
  .openapi("ApplyCampaignResponse");

const CampaignListQuery = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .openapi({ description: "true で有効なキャンペーンのみ" }),
});

const CampaignIdParam = z.object({
  id: z.string().openapi({ param: { name: "id", in: "path" } }),
});

const ApplyCampaignRequestSchema = z
  .object({
    order_id: z.string().min(1),
  })
  .openapi("ApplyCampaignRequest");

export const campaignRoutes = new OpenAPIHono();

const createCampaignRoute = createRoute({
  method: "post",
  path: "/campaigns",
  tags: ["campaign"],
  summary: "キャンペーンを作成",
  security: [{ ApiKeyAuth: [] }],
  request: {
    body: { content: { "application/json": { schema: CreateCampaignRequestSchema } } },
  },
  responses: {
    201: {
      description: "作成されたキャンペーン",
      content: { "application/json": { schema: CampaignSchema } },
    },
    ...errorResponses,
  },
});
campaignRoutes.openapi(createCampaignRoute, async (c) => {
  const body = c.req.valid("json");
  const campaign = await createCampaign(body);
  return c.json(campaign, 201);
});

const listCampaignsRoute = createRoute({
  method: "get",
  path: "/campaigns",
  tags: ["campaign"],
  summary: "キャンペーン一覧",
  security: [{ ApiKeyAuth: [] }],
  request: { query: CampaignListQuery },
  responses: {
    200: {
      description: "キャンペーン一覧",
      content: { "application/json": { schema: z.array(CampaignSchema) } },
    },
    ...errorResponses,
  },
});
campaignRoutes.openapi(listCampaignsRoute, async (c) => {
  const { active } = c.req.valid("query");
  const today = new Date().toISOString().split("T")[0]!;
  const campaigns =
    active === "true"
      ? await listActiveCampaigns(today)
      : await listActiveCampaigns("9999-12-31");
  return c.json(campaigns, 200);
});

const applyCampaignRoute = createRoute({
  method: "post",
  path: "/campaigns/{id}/apply",
  tags: ["campaign"],
  summary: "受注にキャンペーンを適用",
  security: [{ ApiKeyAuth: [] }],
  request: {
    params: CampaignIdParam,
    body: { content: { "application/json": { schema: ApplyCampaignRequestSchema } } },
  },
  responses: {
    200: {
      description: "適用結果",
      content: { "application/json": { schema: ApplyCampaignResponseSchema } },
    },
    ...errorResponses,
  },
});
campaignRoutes.openapi(applyCampaignRoute, async (c) => {
  const { id } = c.req.valid("param");
  const body = c.req.valid("json");
  const result = await applyCampaign(body.order_id, id);
  return c.json(result, 200);
});
