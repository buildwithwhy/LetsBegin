// Project templates — one-click starts for common use cases

export interface ProjectTemplate {
  id: string;
  title: string;
  icon: string;
  brief: string;
  category: "build" | "content" | "outreach" | "life" | "business";
  justMeDefault?: boolean; // default to just-me mode
}

export const templates: ProjectTemplate[] = [
  {
    id: "comparison-site",
    title: "Comparison website",
    icon: "\u2696\uFE0F",
    category: "build",
    brief: `Build a comparison website that compares products/tools side by side.

I need:
- A clean, responsive website with comparison tables
- Data collection on each product (features, pricing, pros/cons)
- Filtering and sorting capabilities
- SEO-friendly pages for each comparison

The site should be easy to update when new tools launch.`,
  },
  {
    id: "reddit-post",
    title: "Reddit post",
    icon: "\uD83D\uDCAC",
    category: "content",
    brief: `Create and post valuable content on Reddit.

I need:
- Research the right subreddits for my topic
- Draft a post that fits the subreddit culture (not spammy)
- Prepare answers for likely comments
- Post at the optimal time for engagement`,
  },
  {
    id: "outreach-campaign",
    title: "Partnership outreach",
    icon: "\uD83E\uDD1D",
    category: "outreach",
    brief: `Run a partnership outreach campaign to local businesses.

I need:
- Research and list potential partner businesses
- Draft personalized outreach emails/messages
- Create a follow-up sequence
- Track responses and next steps
- Prepare a pitch deck or one-pager`,
  },
  {
    id: "video-workflow",
    title: "Video creation",
    icon: "\uD83C\uDFA5",
    category: "content",
    brief: `Create a video for my channel/content.

I need:
- Script writing with hook, content, and CTA
- Shot list or visual storyboard
- Recording setup and checklist
- Editing plan with timestamps
- Thumbnail and title options
- Publishing checklist (description, tags, etc.)`,
  },
  {
    id: "new-product",
    title: "Launch a new product",
    icon: "\uD83D\uDE80",
    category: "build",
    brief: `Build and launch a new product from scratch.

I need:
- Define the core value proposition
- Build the MVP (landing page + core feature)
- Set up analytics and feedback collection
- Create launch content (social posts, Product Hunt, etc.)
- Plan the first week of user outreach`,
  },
  {
    id: "gtm-strategy",
    title: "GTM strategy",
    icon: "\uD83C\uDFAF",
    category: "business",
    brief: `Create a go-to-market strategy for an existing product.

I need:
- Target audience definition and segmentation
- Messaging and positioning framework
- Channel strategy (which platforms, what content)
- Launch timeline with milestones
- Success metrics and tracking setup`,
  },
  {
    id: "weekly-planning",
    title: "Weekly planning",
    icon: "\uD83D\uDCC5",
    category: "life",
    justMeDefault: true,
    brief: `Plan my week ahead.

I need:
- Review what happened last week
- Set 3 main goals for this week
- Break goals into daily tasks
- Schedule time blocks for deep work
- Identify any blockers or appointments to work around`,
  },
  {
    id: "move-apartment",
    title: "Move apartments",
    icon: "\uD83C\uDFE0",
    category: "life",
    justMeDefault: true,
    brief: `Plan and execute an apartment move.

I need:
- Research and compare new apartments/neighborhoods
- Handle lease logistics (notice, deposits, overlap)
- Organize packing by room
- Schedule movers or truck rental
- Set up utilities and address changes
- Clean old place, set up new place`,
  },
  {
    id: "agentic-workflow",
    title: "Agentic workflow",
    icon: "\uD83E\uDD16",
    category: "build",
    brief: `Build an agentic workflow that automates a repeating process.

I need:
- Define the trigger and input (what kicks it off)
- Design the agent pipeline (what steps the AI handles)
- Define human checkpoints (where a person reviews/approves)
- Build the integration layer (APIs, webhooks, etc.)
- Set up monitoring and error handling
- Test with real data end-to-end`,
  },
  {
    id: "research-outreach",
    title: "Research / academic outreach",
    icon: "\uD83D\uDCDA",
    category: "outreach",
    brief: `Reach out to people I've referenced, cited, or am connected to professionally.

I need:
- Extract all the people/authors from my references or document
- Research each person — find their email, website, social profiles
- Draft personalized outreach emails explaining the connection and ask
- Create a tracking sheet for who I've contacted and their responses
- Plan follow-up timing and messaging`,
  },
  {
    id: "batch-outreach",
    title: "Batch email campaign",
    icon: "\uD83D\uDCE8",
    category: "outreach",
    brief: `Send personalized emails to a list of people — not mass-blast, each one tailored.

I need:
- Define the target list and what I know about each person
- Draft a personalized email for each person (not template — actually personalized)
- Review all drafts before sending
- Create a follow-up sequence for non-responders
- Track responses and next steps`,
  },
];
