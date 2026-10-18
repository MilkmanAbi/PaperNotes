/** T^T: a button that does nothing useful. Press it, get a line about
 *  studying from someone who has clearly been studying too long. They come
 *  in a shuffled order and don't repeat until you've seen them all. */

import { showPopover } from './popover.js';
import { escapeHtml } from './study.js';

export const QUOTES = [
  'The syllabus is a threat and I am taking it personally.',
  'I opened the notes. The notes opened me. We are both worse for it.',
  "Studying is just reading the same paragraph eleven times until your brain files a restraining order.",
  'My GPA and my sleep schedule are in a toxic relationship and neither will leave.',
  'Due tomorrow? Do tomorrow. Due today? Fuck it, we ball.',
  'I am not procrastinating. I am letting the anxiety marinate for flavour.',
  "Every time I say \"just one more chapter\" a lecturer somewhere gains a life.",
  'Reading the textbook like it owes me money.',
  "The exam is in 3 days. I know nothing. I am, however, extremely hydrated.",
  'Highlighted the whole page. Everything is important. Nothing is important. I am the highlighter now.',
  'My brain has 47 tabs open and 46 of them are playing music.',
  'If I fail, I fail with style, with colour-coded notes nobody asked for.',
  'Revision is just remembering that you never understood it the first time.',
  "Me: I'll start at 8. Also me at 8:01: well now it's ruined, 9 it is.",
  'Caffeine is not a personality. It is a load-bearing wall.',
  'Learning is a journey. Mine has potholes, detours and a guy screaming in the back seat (me).',
  "I don't study hard. I study scared.",
  'The lecture slides said "trivial". The lecture slides lied.',
  'This formula is going in my brain whether my brain likes it or not.',
  'Some people have a study routine. I have a study hostage situation.',
  'I could become a different person in the time it takes this PDF to make sense.',
  "Exam tip: if you don't know the answer, write it confidently. The marker can smell fear.",
  "My notes are 40% content, 60% \"wtf does this mean\".",
  'Sleep is for people who understood the tutorial.',
  "The deadline isn't approaching. I am approaching it, at speed, without brakes.",
  'Studied for 5 minutes. Rewarded myself with 2 hours. Balance.',
  'One day I will look back on this and laugh. Probably hysterically. Probably tonight.',
  "My study playlist is 3 hours long and I've done 11 minutes of work.",
  'The library is quiet because everyone in it is silently dying.',
  "Ctrl+F does not work on my brain and honestly that's a design flaw.",
  'Lecturer: any questions? Me, with no questions because I have no idea what is happening: no.',
  'Understanding the material is optional. Passing is mandatory. Pick your battles.',
  'I am built different. Specifically, I am built wrong.',
  'Flashcards: because rereading your notes 30 times is apparently "passive".',
  "Brain.exe has stopped responding. Would you like to wait or keep studying anyway?",
  'Every lab report I write takes a year off my life and adds a semicolon to my personality.',
  'Note to self: past me is a liar and future me is screwed.',
  "I'm not lazy, I'm in energy-saving mode. Indefinitely.",
  'The textbook weighs 3 kg and every gram is spite.',
  'Me after one productive hour: I deserve a nap, a snack and a parade.',
  'Group project: 4 people, 1 doing the work, 3 doing their best impression of furniture.',
  'Today I will be productive, said I, lying down.',
  "I don't need therapy, I need this module to fucking end.",
  "Studying at 3am hits different. Mostly it hits my will to live.",
  "Plot twist: the \"easy\" question was worth 2 marks and the one I skipped was worth 30.",
  "If I had a dollar for every time I understood this, I'd have a dollar. I'd spend it on coffee.",
  "Whoever wrote \"left as an exercise for the reader\" should be left as an exercise for the reader.",
  "Opened the notes. Closed the notes. Opened the fridge. Same energy.",
  "I'm one Pomodoro away from either enlightenment or a breakdown.",
  'My memory is a sieve and the exam is soup.',
  'Pain is temporary. Transcripts are forever. Ugh.',
  "I don't have trust issues. I have \"the marking scheme changed\" issues.",
  'Retaking the same practice paper until the questions get scared of me.',
  'Grind now, cry later. Or cry now. Multitasking.',
  'I read the question. The question read me back. Neither of us enjoyed it.',
  'Somewhere out there is a version of me who did the readings. I hate them.',
  'My handwriting at the start of the exam: calligraphy. At the end: a seismograph.',
  "The exam room clock moves at 3x speed. That's just science.",
  'I have two moods: "I can do this" and "I should drop out and raise goats".',
  "The goats don't have exams. Think about that.",
  'Studying is free therapy if therapy made you feel worse.',
  "\"It'll make sense later\" — it did not make sense later.",
  'This chapter is giving "skip me and fail".',
  "I'm not overthinking. I'm under-revising with extra steps.",
  'Me explaining the topic to my rubber duck. The duck has dropped out.',
  "A wise person once said \"start early\". They are not invited to my funeral.",
  "Opened Claude to explain one thing. Now I know about Byzantine tax law and still not this thing.",
  'My study plan is perfect. It just requires a different person to follow it.',
  "Weekly to-do list: 1. Everything. 2. Cry. 3. See item 1.",
  'Cramming is just speedrunning knowledge with a 70% chance of a soft lock.',
  'I learn best under pressure. Unfortunately I also panic best under pressure.',
  "If you can't explain it simply, you don't understand it. I can't explain it at all. Bold of me to be here.",
  'Calculators: allowed. Emotional support: not on the list of approved materials.',
  'Reading my old notes like an archaeologist decoding a cursed tablet.',
  "I'm not saying the exam was hard, but I wrote \"see attached\" and attached nothing.",
  'Brain at 2pm: nothing. Brain at 2am: the entire syllabus and three new anxieties.',
  'Some study with lo-fi beats. I study with the sound of my future crumbling.',
  'A for effort. F for everything else.',
  "Me: I'll just check one thing on my phone. My phone: it's been 90 minutes, babe.",
  "I would simply understand it, if I could.",
  "The answer is 42. I don't know the question but I'm writing 42.",
  "Exam? Never heard of her.",
  'You miss 100% of the questions you leave blank. Write something. Write anything. Write a poem.',
  'Study smarter, not harder. I am doing neither. I am doing vibes.',
  'My last brain cell is working overtime and asking for a union.',
  'Knowledge is power. I am running on a single AA battery.',
  'Remember: diamonds are made under pressure. So are panic attacks.',
  "Today's goal: understand one (1) concept. Stretch goal: remember it tomorrow.",
  'Lectures at 8am should be a war crime.',
  'Every past paper I do is a jump scare.',
  "If studying burned calories I'd be a skeleton by now. It does not. I am snack-powered.",
  'Breaking news: local student discovers the tutorial had answers all along.',
  'I am the main character. The genre is tragedy.',
  'This is fine. Everything is fine. The notes are on fire but the notes are fine.',
  'I fear no man. But that one module... it scares me.',
  'Some people peak in school. I am still looking for the slope.',
  "I didn't choose the cram life. The cram life chose me because I ignored it for 6 weeks.",
  'My notebook has more doodles than notes and honestly the doodles are better educated.',
  "Teacher: show your working. Me: my working is a series of increasingly desperate guesses.",
  "Do it for future you. Future you is tired, broke and still grateful.",
  'Small steps. Tiny steps. Microscopic steps. Steps so small they are technically standing still.',
  'Today I learnt nothing, but I learnt it thoroughly.',
  "The silence after the invigilator says \"you may begin\" is the loudest thing I've ever heard.",
  "Me trying to remember the formula: it starts with a letter. Probably.",
  "I'm 80% sure I studied the wrong chapter and 100% sure I'm committed now.",
  'Unit 4 looked at me funny so now we are fighting.',
  'Hydrate. Revise. Cry. Repeat. Hydrate again because crying is dehydrating.',
  "My laptop has seen things in this study session. It's thinking of dropping out too.",
  'Imagine being a textbook. Couldn\'t be me. Couldn\'t be read either, apparently.',
  'Every day I wake up and choose violence against the syllabus.',
  "I studied so hard I forgot my own name. Didn't remember the content though.",
  'They said uni would be the best years of my life. Bold claim, no citation.',
  'Me looking at the mark scheme: oh, that is what they meant. Me in the exam: anyway.',
  "I have read this sentence 9 times and I now know it's in English. Progress.",
  "Dear brain, please store this. Not the song from the ad. This.",
  "Lecturer: this won't be on the exam. The exam: it's me, I'm on it.",
  'Revision timetable: colour-coded, laminated, completely ignored.',
  'My study group is just us collectively agreeing nobody knows anything.',
  'One Pomodoro down. Feeling powerful. Unstoppable. Napping now.',
  'Fake it till you make it. Or fake it till the exam. Whichever comes first.',
  "I'm not behind. I'm just ahead of next semester's problems.",
  'Learning a new concept and immediately forgetting the previous one. Fixed-capacity brain, first in first out.',
  'Me: understands the example. Question: completely different shape. Me: betrayal.',
  "My final form is a hoodie, three energy drinks and a thousand-yard stare.",
  "If ignorance is bliss, why am I this stressed?",
  "Not all who wander are lost. I am, though. I'm very lost. Which lecture theatre is this.",
  "The citation style changed. I'm changing too. Into a goblin.",
  'Proof by "trust me bro". Marks awarded: zero. Confidence: undefeated.',
  "Some people's hard drive is full of memories. Mine is full of formulas I'll forget in 4 hours.",
  'I am once again asking my brain for a little focus.',
  'Plot twist: the hardest part of studying is the starting. The second hardest part is everything else.',
  "Treat yourself like a houseplant: water, light, and occasionally talk to yourself encouragingly while crying.",
  "The notes won't read themselves. I checked. I waited. They didn't.",
  'Sorry, I can\'t, I have a deadline. (I will be doing nothing. Very stressfully.)',
  'Ah yes, the three stages of studying: denial, panic and making a beautiful title page.',
  "Exams don't measure intelligence. They measure how fast you can panic in a straight line.",
  'Do not disturb: currently pretending to understand calculus.',
  "Brain: let's think about that embarrassing thing from 2017. Me: we have a test. Brain: exactly.",
  'Opened the module page, saw 14 unwatched lectures, closed my eyes, became one with the void.',
  "I don't need luck. I need a time machine and a stern word with past me.",
  "Read. Understand. Forget. Panic. Reread. Understand slightly more. Exam. Forget everything. Circle of life.",
  "My study method is called \"Final Destination\": everything I avoid catches up with me eventually.",
  'There is no "I" in team. There is, however, "I did all of it" in group project.',
  'Pretty sure the textbook is written in English, but I would like a second opinion.',
  'Motivation left the chat. Discipline is typing...',
  'Discipline also left the chat. Spite has entered the chat. Spite is carrying.',
  'I am powered by spite and the specific fear of having to retake this.',
  'Studying is just collecting future flashbacks.',
  'This topic has the same energy as a printer jam: confusing, loud and somehow my fault.',
  'Hot take: the semicolon in this C code is personally attacking me.',
  "Segmentation fault (core dumped). Same, honestly.",
  "It compiles. Don't touch it. Don't breathe near it. Submit it.",
  "Debugging is being the detective in a crime movie where you're also the murderer.",
  'Works on my machine. Does my machine count as the examiner? No? Fuck.',
  'Me after writing 3 lines of code: time for a well-earned break.',
  'Ohm\'s law? More like OMG law. Resistance is futile and also measured in ohms.',
  'Voltage is just electrical peer pressure. That\'s on the exam now.',
  "Binary is easy, it's just 1s and 0s. Like my motivation: on, off, off, off, off.",
  'An algorithm is just a to-do list that will actually get done. Unlike mine.',
  "Big-O of my productivity: O(n!) where n is the number of things I should be doing.",
  "I'm not ignoring the readings, I'm caching them for later. The cache is empty.",
  'Stack overflow: the website and my emotional state.',
  'Ran my code. It said "undefined". Felt seen.',
  "Every 'quick question' to the lecturer is a 45-minute side quest.",
  "The deadline is a social construct. The penalty for missing it is very real though.",
  'If at first you don\'t succeed, check the mark scheme, cry, then try again.',
  'Me pretending the 20-page reading is optional: it is not optional.',
  'Today I will absorb knowledge like a sponge. A dry, crusty, forgotten sponge.',
  'Nothing humbles you faster than reading your own notes from week 2.',
  'Week 2 me: this is easy. Week 12 me: who let this happen.',
  'Studying is 10% learning and 90% negotiating with myself.',
  'Negotiations failed. The snack has been eaten. The chapter remains unread.',
  "I don't have a study-life balance. I have a study-crisis cycle.",
  'Just one more episode, I said, opening the lecture recording at 2x speed like a podcast from hell.',
  "Lectures at 2x speed: now I don't understand them twice as fast.",
  'The vibe is academic weapon. The reality is academic water pistol.',
  'Academic weapon? More like academic spoon. Still sharp in the right light.',
  'You are not behind. You are on a scenic route. Through a swamp. In the dark. You got this. (╥﹏╥)',
  'Breathe. You have survived 100% of your worst study days so far. Annoying record to break.',
  'Close the tab. No, the other tab. No, not that one either. You know which one.',
  'Fun fact: staring at the wall is not revision, no matter how intensely you do it.',
  'If you read this, drink some water and do 10 more minutes. That\'s it. Tiny win. Go.',
  'The textbook says it "follows naturally". Nothing about this is natural. Unnatural, even.',
  "I'm not crying, my eyes are just sweating out the information I failed to retain.",
  '(ノಠ益ಠ)ノ彡┻━┻  me, flipping the table, at chapter 7.',
  '┬─┬ノ( º _ ºノ)  me, putting the table back, because I still have to study at it.',
  '(￣▽￣)ノ  past me, leaving everything to future me, waving.',
  '(；´Д`)  me, future me, receiving everything.',
  'ʕ•ᴥ•ʔ  this bear has also not done the readings. you are not alone.',
  '(⊙_☉)  me realising the exam is open-book and I still have no idea.',
  '٩(ˊᗜˋ*)و  one flashcard done. only 299 to go. love that for us.',
  'T^T  me, at this button, instead of studying. we know. we are the same.',
  'You pressed T^T again. Are you studying or are you just here for me? (I am flattered.)',
  'Okay that was the last one. Kidding. There are more. Go study though. Seriously. Okay one more.',
];

const ORDER_KEY = 'paper-notes/tt/v1';

function nextQuote() {
  let st = { order: [], i: 0 };
  try { st = JSON.parse(localStorage.getItem(ORDER_KEY) || 'null') || st; } catch { /* fresh */ }
  if (!Array.isArray(st.order) || st.order.length !== QUOTES.length || st.i >= st.order.length) {
    st.order = QUOTES.map((_, i) => i);
    for (let i = st.order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [st.order[i], st.order[j]] = [st.order[j], st.order[i]]; }
    st.i = 0;
  }
  const q = QUOTES[st.order[st.i++]];
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(st)); } catch { /* fine */ }
  return { text: q, n: st.i, of: QUOTES.length };
}

/** The button, for the top bar. */
export function mountQuotes(mount) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn tt-btn';
  btn.title = 'T^T (press for wisdom, of a kind)';
  btn.setAttribute('aria-label', 'A quote about studying');
  btn.textContent = 'T^T';
  mount.appendChild(btn);

  let handle = null;
  const say = () => {
    const q = nextQuote();
    btn.classList.remove('is-wobble');
    void btn.offsetWidth;
    btn.classList.add('is-wobble');
    const el = document.createElement('div');
    el.className = 'tt-bubble';
    el.innerHTML = `<p class="tt-bubble__text">${escapeHtml(q.text)}</p>
      <div class="tt-bubble__foot"><span class="caption">${q.n} / ${q.of}</span>
        <span class="panel__spacer"></span>
        <button class="btn btn--ghost tt-bubble__copy" title="Copy">Copy</button>
        <button class="btn btn--secondary tt-bubble__more">Another <kbd>T</kbd></button></div>`;
    el.querySelector('.tt-bubble__more').onclick = say;
    el.querySelector('.tt-bubble__copy').onclick = (e) => { navigator.clipboard.writeText(q.text); e.target.textContent = 'Copied'; };
    el.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 't' && !e.ctrlKey) { e.preventDefault(); say(); } });
    handle = showPopover(el, { anchor: btn, cls: 'popover--tt' });
    // Centre it under the button.
    const r = btn.getBoundingClientRect();
    const w = handle.el.offsetWidth;
    handle.el.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    handle.el.querySelector('.tt-bubble__more').focus();
  };
  btn.onclick = say;
  btn.addEventListener('animationend', () => btn.classList.remove('is-wobble'));
  return btn;
}
