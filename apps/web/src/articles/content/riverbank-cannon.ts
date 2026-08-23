import { playClosing } from '../diagrams.js';
import {
  RB_ADVISOR_TRAP,
  RB_SEAL_COVER,
  RB_STEALTH_PAIR,
  RB_TRIPWIRE_PAIR,
} from '../riverbank-cannon-diagrams.js';
import type { Article, ArticleBlock } from '../types.js';

// The fog-xiangqi opening-balance essay. Every line here is verified against
// the rules kernel by the scripts in docs-private/fog-xiangqi-balance/ (which
// also holds the engine runs the numbers come from). The replay blocks step
// through the exact verified sequences via the fog kernel; the static diagrams
// are built from replayed kernel states in ../riverbank-cannon-diagrams.ts.
export const riverbankCannonArticle: Article = {
  slug: 'riverbank-cannon',
  kind: 'article',
  publisher: 'mistboard',
  boardFamily: 'xiangqi',
  title: 'The Riverbank Cannon Problem',
  seoTitle: 'Fog Xiangqi Opening Theory: The Riverbank Cannon',
  summary:
    'Red’s opening cannon reaches the riverbank first and aims at five files at once, and in fog you never see it coming. Whether that breaks the game came down to one elephant move, one poisoned defense, and a coin flip we priced with the engine.',
  status: 'draft',
  audience:
    'Fog xiangqi players, xiangqi players curious about the fog variant, and anyone who wants to see how a hidden-information opening gets analyzed honestly.',
  intro: [
    {
      kind: 'paragraph',
      text:
        'Fog xiangqi is xiangqi with two changes: you only see the points your own pieces could move to, and there is no check. Capture the general and the game ends.',
    },
    {
      kind: 'paragraph',
      text:
        'Put those together and Red’s opening cannon becomes alarming. Slide it to the riverbank and it aims down five files at once: the chariots behind the edge soldiers, the elephants behind theirs, and behind the center soldier, the general. One cannon capture ends the game. I built this variant, and I started to wonder whether it was dead on arrival.',
    },
    {
      kind: 'paragraph',
      text:
        'So I checked. Every line below is verified against Mistboard’s rules engine, and the endgames are played out by Misty, our fog engine. The short version: the threat is worse than I thought, the defense most players will find first is a trap, and the game survives anyway.',
    },
  ],
  sections: [
    {
      heading: 'The rush is invisible',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The direct version at least announces itself: the cannon lifts through the b-file, and Black’s own cannon, watching down that file, sees an anonymous red piece land on the riverbank. You cannot tell what it is, but you know something came. Red does not have to grant you that. Up the empty d-file, nothing Black owns sees a single point: d3, d5, across to the center, mate on move 4. The only signal is that a red piece left home, which describes every xiangqi game ever played.',
        },
        {
          kind: 'raw-svg',
          svg: RB_STEALTH_PAIR,
          caption:
            'One move before mate. Left: the truth, with the cannon’s route and its target. Right: everything Black can see. The cannon never enters the picture.',
        } as ArticleBlock,
        {
          kind: 'xq-replay',
          spec: {
            iccs: 'b2d2 h9g7 d2d4 b9c7 d4e4 c6c5 e4e9',
            red: 'Red',
            black: 'Black',
            title: 'The stealth rush',
            event: 'Kernel-verified line',
            resultText:
              'Red captures the general on move 4. Black developed normally and saw nothing.',
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'So defense cannot be reactive: you have to play the answer every game, rush or no rush. Chess’s Scholar’s Mate at least enters your half of the board; the cannon fires from outside your vision. The rest of this article draws the visible b-file route so the diagrams are easy to follow. Every riverbank threat is identical however the cannon arrived; the defense must not care.',
        },
      ],
    },
    {
      heading: 'The natural defense loses by force',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The snipe works because there is exactly one screen between cannon and general: Black’s own center soldier. A cannon needs exactly one, so any second body on the center file kills the mate. Black has six ways to do that on move one. They are not equal.',
        },
        {
          kind: 'paragraph',
          text:
            'The one most players find first is advisor up: shortest path, stays in the palace. It loses by force.',
        },
        {
          kind: 'raw-svg',
          svg: RB_ADVISOR_TRAP,
          caption:
            'The advisor sealed, and Red took the elephant on the other wing. The cannon fires through the remaining advisor; the marked flight square loses to the same shot; the sealing advisor sits on the only parry square. All 41 of Black’s legal moves lose within two moves, engine-checked.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Red cannot see which advisor sealed, so he guesses the wing to raid: wrong wins an elephant, right is mate. A coin flip where tails is forced mate is not a defense.',
        },
      ],
    },
    {
      heading: 'One elephant move holds everything',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'The move that works is the standard developing move of xiangqi: elephant to the middle.',
        },
        {
          kind: 'raw-svg',
          svg: RB_SEAL_COVER,
          caption:
            'The central elephant. Second screen on the center file, so the snipe is marked dead; both elephant home points covered by the recapture.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'The snipe is dead, and the elephant grabs now trade a cannon for an elephant, in Black’s favor. One move, three files, and it is a move your opening wanted anyway. Xiangqi theory arrived at this square centuries before the fog did. A cannon to the same point works too, and keeps both elephants home.',
        },
      ],
    },
    {
      heading: 'The chariot gamble',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'That leaves the edges. From the riverbank corner the cannon shoots the chariot through the edge soldier, and the elephant does nothing about that. There is a reactive block (a horse to the edge file), but the better scheme comes from a deadline.',
        },
        {
          kind: 'paragraph',
          text:
            'The seal can wait one move: the snipe cannot land before Red’s third move. The edge cannot wait: Red commits his cannon on move two. So soldier first, elephant second. The pushed soldier watches the one point the cannon must fire from, and a cannon that lands there dies before it can shoot.',
        },
        {
          kind: 'raw-svg',
          svg: RB_TRIPWIRE_PAIR,
          caption:
            'The same push, one move apart. Played first, the soldier watches the arrival point and the cannon dies on landing. Played second, the cannon is already there and shoots the chariot straight over the soldier: a pushed soldier still counts as one screen.',
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'Now the opening is an honest gamble, and a one-shot: Red’s only window is committing blind on move two, because a third Black move puts a horse on the other edge and closes both rims. Red picks an edge. Half the time it is the watched one and he trades his cannon for a soldier. Half the time he wins a chariot. We played both branches with the engine, five games each: the chariot branch converted about two thirds for Red, and the cannon branch cost him more than the cannon, because the soldier recapture hands Black a screen and the corner chariot falls to the counter-shot in every playout. Priced together, the rush is one fair coin flip per game against a player who knows the scheme.',
        },
      ],
    },
    {
      heading: 'Whoever moves the wall first dies',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'One pattern decided games in every branch, and it travels to any fog game with long-range pieces. A cannon on its firing point is also the block against the enemy cannon opposite: loaded and shielding at once. Whoever steps away first, the other fires through the hole. And the fog baits you: from the wall, an enemy soldier looks free through the blur. Take it and you are mated on the reply. Every bot we tested fell for this.',
        },
        {
          kind: 'xq-replay',
          spec: {
            iccs: 'b2b4 h7h5 b4a4 h5e5 a4a9 e5e0',
            red: 'Red',
            black: 'Black',
            title: 'The counter-battery',
            event: 'Kernel-verified line',
            resultText:
              'Black skipped the elephant entirely and parked a cannon on the center file. Red cannot see it, grabs the chariot, and is mated on the reply.',
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            'That answers a fair question: why not go up to the riverbank yourself as Black? You can, and this is what it looks like. The battery is Black’s riverbank plan, and it punishes any Red who cashes a grab. Against a Red who seals before grabbing, though, the cannon sits frozen on e6 for the rest of the game, the edge gamble comes back a move later, and you are less developed than the soldier line leaves you. The engine\u2019s converged verdict on that position is +0.25 for Red, against dead even for the soldier line. Play the battery against opponents who grab. The soldier line stays the default.',
        },
      ],
    },
    {
      heading: 'What the engine says',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'I scripted the rush and made Misty defend blind, twenty games. It found a seal by move three in every one, elephant or cannon as the position suggested, and won all twenty; not one snipe landed. My scripted Red plays the opening perfectly and the middlegame badly, so read that as the rush never landing, not as Black dominance. Here is one of the twenty in full:',
        },
        {
          kind: 'xq-replay',
          spec: {
            iccs: 'b2d2 h9g7 d2d4 b7e7 d4e4 b9c7 e4a4 h7i7 a4a9 e7e3 a9d9 i9h9 d9f9 h9h2 f9c9 h2e2 c0e2 e3e0',
            red: 'Scripted rush',
            black: 'Misty DXQ',
            title: 'Defense game 7 of 20',
            event: 'Engine playout, full record',
            resultText:
              'Red wins a chariot, two advisors, and an elephant, and is mated on move 9 anyway: his own recapture on e3 became the screen for Black\u2019s e-file cannon. Material does not save a leaking file.',
          },
        } as ArticleBlock,
        {
          kind: 'paragraph',
          text:
            // LOCAL study id: reseed on prod at publish time (apps/server/src/seed-riverbank-study.ts) and update this link.
            'All the games behind this article are in the [companion study](/study/A8lqGE6i): the theory lines, the twenty defense games, ten rim-gambit games where the chariot grab lands, and sixteen engine self-play games. Flip the study board to Black’s fogged view and step through what he actually saw.',
        },
        {
          kind: 'paragraph',
          text:
            'Playing both sides from the start, sixteen games, Red won eleven of the twelve decisive ones and never once played the rush: soldier pushes, horses, the central cannon, long middlegames. Sixteen shallow games is a lean sample, and self-play exaggerates first-mover effects, so treat the eleven as a direction.',
        },
        {
          kind: 'paragraph',
          text:
            'The engine\u2019s position evaluations are firmer ground: they hold still under a sixteen-fold compute increase (64 to 1024 search iterations), so these are converged verdicts on its -1 to +1 scale.',
        },
        {
          kind: 'table',
          headers: ['position', 'engine verdict'],
          rows: [
            ['game start, Red to move', '+0.06 Red: a real but small first-move edge'],
            ['theory settled: seal up, rush cannon on e5', '0.00: dead even, the rush fully answered'],
            ['Red won the chariot flip', '-0.75 for Black: close to lost, still fighting'],
            ['Red lost the cannon flip', '-0.55 for Red: clearly losing'],
            ['counter-battery vs a Red who seals first', '+0.25 Red: the battery concedes more than the soldier line'],
          ],
        },
        {
          kind: 'paragraph',
          text:
            'Average the two flip branches and the committed rush is worth about +0.10 to Red, the same ballpark as the +0.06 he starts with. The whole first-move advantage, spent in one gamble. First-move initiative in fog xiangqi is real, probably bigger than in chess, because defense is paid for blind; the rush is just the loudest way to spend it, and the loudest way is answerable.',
        },
      ],
    },
    {
      heading: 'The line to learn',
      blocks: [
        {
          kind: 'paragraph',
          text:
            'As Black: push an edge soldier, then elephant to the middle, then a horse to the other edge. Three moves and every target is covered; the only thing Red can ever hit is the chariot on the edge you did not push, and only by committing to it on his second move. Never seal with the advisor. And if a cannon lands on your back rank anyway, count screens before you move anything near it; most of the losses we found came from moving a piece that was quietly holding a firing line shut.',
        },
        {
          kind: 'paragraph',
          text:
            'As Red: the rush beats anyone who has not read this far, and it is even money against anyone who has. If you play it anyway, commit to an edge on move two or not at all, and seal with your own elephant before cashing any grab: every scripted Red that grabbed first was mated, one hundred percent.',
        },
      ],
    },
    playClosing({
      heading: 'Step through it yourself',
      lead:
        'Every line and every game in this article is in the companion study, on a board you can flip to either side\u2019s fogged view. When you are ready, Misty will punish you while you learn the line. No account required.',
      // LOCAL study id: reseed on prod at publish (seed-riverbank-study.ts) and update.
      playLabel: 'Open the companion study',
      playHref: '/study/A8lqGE6i',
      secondary: [
        {
          label: 'Play vs computer',
          href: '/?play=computer&gameSpecId=dark-xiangqi',
          emphasis: 'secondary',
        },
      ],
    }),
  ],
};
