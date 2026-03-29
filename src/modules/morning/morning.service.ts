// src/modules/morning/morning.service.ts

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Morning Focus Forge — data service
 *
 * Provides three data sources for the 8:30–10am focus window:
 * 1. Daily Bread  — rotating scripture + wisdom (no external API dependency)
 * 2. Top Tasks    — P1/P2 Todoist tasks, max 3
 * 3. TELOS Goal   — current weekly goal from config/morning.json
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DailyBread {
  reference: string;
  text: string;
  wisdom: string;
}

export interface TodoistTask {
  id: string;
  content: string;
  priority: number; // 4=P1, 3=P2
  due: string | null;
  url: string;
}

export interface TelosGoal {
  goal: string;
  context: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Daily Bread — curated rotating scripture + wisdom pairs
// ---------------------------------------------------------------------------

const DAILY_BREAD_LIST: Array<{
  reference: string;
  text: string;
  wisdom: string;
}> = [
  {
    reference: 'Psalm 23:1',
    text: 'The Lord is my shepherd; I shall not want.',
    wisdom: 'True provision begins with trust, not striving.',
  },
  {
    reference: 'John 15:5',
    text: 'I am the vine; you are the branches. If you remain in me and I in you, you will bear much fruit.',
    wisdom: 'Abide first. Results follow from connection, not effort alone.',
  },
  {
    reference: 'Proverbs 3:5–6',
    text: 'Trust in the Lord with all your heart and lean not on your own understanding; in all your ways submit to him, and he will make your paths straight.',
    wisdom: 'Submission is not weakness — it is the highest form of wisdom.',
  },
  {
    reference: 'Isaiah 40:31',
    text: 'Those who hope in the Lord will renew their strength. They will soar on wings like eagles.',
    wisdom: 'Waiting on God is active trust, not passive delay.',
  },
  {
    reference: 'Matthew 6:33',
    text: 'Seek first his kingdom and his righteousness, and all these things will be given to you as well.',
    wisdom: 'Ordered priorities produce ordered lives.',
  },
  {
    reference: 'Philippians 4:6–7',
    text: 'Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.',
    wisdom: 'Anxiety is a prayer invitation waiting to be answered.',
  },
  {
    reference: 'Joshua 1:9',
    text: 'Have I not commanded you? Be strong and courageous. Do not be afraid; do not be discouraged, for the Lord your God will be with you wherever you go.',
    wisdom: 'Courage is commanded — it is an act of obedience.',
  },
  {
    reference: 'Romans 8:28',
    text: 'And we know that in all things God works for the good of those who love him, who have been called according to his purpose.',
    wisdom: 'All things — not just the pleasant ones — are under his sovereign care.',
  },
  {
    reference: 'Lamentations 3:22–23',
    text: "Because of the Lord's great love we are not consumed, for his compassions never fail. They are new every morning.",
    wisdom: 'Each morning is a fresh grant of mercy — receive it before you earn it.',
  },
  {
    reference: 'Exodus 33:11',
    text: 'The Lord would speak to Moses face to face, as one speaks to a friend.',
    wisdom: 'Intimacy with God is the goal, not information about God.',
  },
  {
    reference: 'Psalm 46:10',
    text: 'Be still, and know that I am God.',
    wisdom: 'Stillness is not emptiness — it is full attention to the Eternal.',
  },
  {
    reference: 'Titus 2:2',
    text: 'Teach the older men to be temperate, worthy of respect, self-controlled, and sound in faith, in love and in endurance.',
    wisdom: 'Mature character is measured in faithfulness, not fanfare.',
  },
  {
    reference: 'Colossians 3:23',
    text: 'Whatever you do, work at it with all your heart, as working for the Lord, not for human masters.',
    wisdom: 'The audience of one transforms the meaning of ordinary work.',
  },
  {
    reference: '1 Timothy 4:8',
    text: 'For physical training is of some value, but godliness has value for all things, holding promise for both the present life and the life to come.',
    wisdom: 'Invest in what yields eternal returns.',
  },
  {
    reference: 'Psalm 1:1–3',
    text: 'Blessed is the one... whose delight is in the law of the Lord, and who meditates on his law day and night. That person is like a tree planted by streams of water.',
    wisdom: 'Rootedness in the Word produces fruit that does not wither.',
  },
  {
    reference: 'Mark 10:45',
    text: 'For even the Son of Man did not come to be served, but to serve, and to give his life as a ransom for many.',
    wisdom: 'Greatness in the kingdom is measured in service given.',
  },
  {
    reference: 'Hebrews 12:1–2',
    text: 'Let us run with perseverance the race marked out for us, fixing our eyes on Jesus, the pioneer and perfecter of faith.',
    wisdom: 'The race is already marked — run it looking forward, not sideways.',
  },
  {
    reference: 'Micah 6:8',
    text: 'He has shown you, O mortal, what is good. And what does the Lord require of you? To act justly and to love mercy and to walk humbly with your God.',
    wisdom: 'Three words: justice, mercy, humility. The entire ethic in a sentence.',
  },
  {
    reference: 'Isaiah 58:10',
    text: 'And if you spend yourselves in behalf of the hungry and satisfy the needs of the oppressed, then your light will rise in the darkness.',
    wisdom: 'Light is released through generosity, not hoarded through caution.',
  },
  {
    reference: 'Luke 10:41–42',
    text: '"Martha, Martha," the Lord answered, "you are worried and upset about many things, but few things are needed — or indeed only one."',
    wisdom: 'The tyranny of urgency can crowd out the one necessary thing.',
  },
  {
    reference: '2 Timothy 1:7',
    text: 'For the Spirit God gave us does not make us timid, but gives us power, love and self-discipline.',
    wisdom: 'Fear is not a fruit of the Spirit — courage is.',
  },
  {
    reference: 'Jeremiah 29:11',
    text: '"For I know the plans I have for you," declares the Lord, "plans to prosper you and not to harm you, plans to give you hope and a future."',
    wisdom: 'The Planner is trustworthy — trust the plan.',
  },
  {
    reference: 'Psalm 119:105',
    text: 'Your word is a lamp for my feet, a light on my path.',
    wisdom: 'Enough light for the next step is always enough.',
  },
  {
    reference: 'John 10:10',
    text: 'I have come that they may have life, and have it to the full.',
    wisdom: 'Abundant life is given, not manufactured.',
  },
  {
    reference: 'Galatians 5:22–23',
    text: 'But the fruit of the Spirit is love, joy, peace, forbearance, kindness, goodness, faithfulness, gentleness and self-control.',
    wisdom: 'Character is grown, not performed. Tend the roots.',
  },
  {
    reference: 'Matthew 11:28–30',
    text: '"Come to me, all you who are weary and burdened, and I will give you rest. Take my yoke upon you and learn from me."',
    wisdom: 'Rest is found in yoke-partnership with Jesus, not in absence of work.',
  },
  {
    reference: 'Romans 12:2',
    text: 'Do not conform to the pattern of this world, but be transformed by the renewing of your mind.',
    wisdom: 'Transformation is a mind-first revolution.',
  },
  {
    reference: 'James 1:5',
    text: 'If any of you lacks wisdom, you should ask God, who gives generously to all without finding fault.',
    wisdom: 'Wisdom is available to anyone willing to ask in faith.',
  },
  {
    reference: 'Proverbs 16:3',
    text: 'Commit to the Lord whatever you do, and he will establish your plans.',
    wisdom: 'Consecration precedes establishment.',
  },
  {
    reference: 'Isaiah 26:3',
    text: 'You will keep in perfect peace those whose minds are steadfast, because they trust in you.',
    wisdom: 'Peace is a by-product of a stayed mind, not a stable circumstance.',
  },
  {
    reference: 'Deuteronomy 31:8',
    text: 'The Lord himself goes before you and will be with you; he will never leave you nor forsake you. Do not be afraid; do not be discouraged.',
    wisdom: 'He precedes every meeting, every conversation, every task.',
  },
  {
    reference: 'Psalm 37:4',
    text: 'Take delight in the Lord, and he will give you the desires of your heart.',
    wisdom: 'Delight reshapes desire — his gifts align with his own delight in us.',
  },
  {
    reference: '1 Peter 5:7',
    text: 'Cast all your anxiety on him because he cares for you.',
    wisdom: 'Casting requires an act of will — release, not just acknowledge.',
  },
  {
    reference: 'Philippians 4:13',
    text: 'I can do all this through him who gives me strength.',
    wisdom: 'The "all things" are done through Christ, not instead of him.',
  },
  {
    reference: 'Ephesians 2:10',
    text: "For we are God's handiwork, created in Christ Jesus to do good works, which God prepared in advance for us to do.",
    wisdom: 'Your work today was pre-assigned by a loving craftsman.',
  },
];

export function getDailyBread(): DailyBread {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % DAILY_BREAD_LIST.length;
  return DAILY_BREAD_LIST[index];
}

// ---------------------------------------------------------------------------
// Todoist Tasks — P1 (priority 4) and P2 (priority 3), top 3
// ---------------------------------------------------------------------------

const TODOIST_API_URL = 'https://api.todoist.com/api/v1/tasks';

export async function getTopTasks(token: string): Promise<TodoistTask[]> {
  const response = await fetch(`${TODOIST_API_URL}?filter=p1 | p2`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Todoist API error: ${response.status} ${response.statusText}`);
  }

  const tasks = (await response.json()) as any[];

  // Sort: P1 (priority 4) before P2 (priority 3), then by due date if available
  const sorted = tasks.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const aDue = a.due?.date ?? 'zzzz';
    const bDue = b.due?.date ?? 'zzzz';
    return aDue.localeCompare(bDue);
  });

  return sorted.slice(0, 3).map((t) => ({
    id: t.id,
    content: t.content,
    priority: t.priority,
    due: t.due?.date ?? null,
    url: t.url,
  }));
}

// ---------------------------------------------------------------------------
// TELOS Goal — read from config/morning.json
// ---------------------------------------------------------------------------

const MORNING_CONFIG_PATH = join(process.cwd(), 'config', 'morning.json');

const DEFAULT_TELOS_GOAL: TelosGoal = {
  goal: 'Set your weekly TELOS goal',
  context: 'Update config/morning.json to set your current focus area.',
  updatedAt: new Date().toISOString().split('T')[0],
};

export function getTelosGoal(): TelosGoal {
  if (!existsSync(MORNING_CONFIG_PATH)) {
    return DEFAULT_TELOS_GOAL;
  }
  try {
    const raw = readFileSync(MORNING_CONFIG_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return {
      goal: data.goal || DEFAULT_TELOS_GOAL.goal,
      context: data.context || DEFAULT_TELOS_GOAL.context,
      updatedAt: data.updatedAt || DEFAULT_TELOS_GOAL.updatedAt,
    };
  } catch {
    return DEFAULT_TELOS_GOAL;
  }
}
