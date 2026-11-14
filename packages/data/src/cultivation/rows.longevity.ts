/**
 * 长生纪元：500 岁之后的专属内容。
 *
 * 旧数据在 500 岁就断了，新体系不能只是把境界事件无限重复。
 * 这里按「年龄档」逐层解锁全新的叙事主题：凡人一代代老去 → 宗门与王朝
 * 更迭 → 记忆磨损 → 纪元与灵气枯荣 → 界外星海 → 天道与飞升者。
 *
 * 档位是按实测飞升年龄分布定的：全程平均约 770 岁飞升，所以六档
 * 压在 500–1250 岁之间，前四档几乎每局都能看到，卡关久的玩家能看全。
 * 事件不绑定大境界，只靠 inc:AGE>=N 解锁，哪怕在渡劫期多留几百年，
 * 日志里依然会持续出现没见过的内容。
 *
 * vg 分组用于同主题文案轮换，cd 用于防止短期刷屏。
 */

export const LONGEVITY_ROWS: string[] = [
    // ── 500+：初入长生，同代人尽去 ────────────────────────────────────
    '51400|你回了一趟出生的村子，第七代人管你叫「祖师爷」。|relation|1|SPR:2,INT:2,CULT:16|inc:AGE>=500;cd:12;vg:lon0',
    '51401|当年替你挑水的孩子有了玄孙，墓碑上的名字你一个也不认得。|relation|1|SPR:-1,INT:3,CULT:14|inc:AGE>=500;cd:12;vg:lon0',
    '51402|山门重修了七次，最新的匾额把你的道号写错了一个字。|sect|1|CHR:2,SPR:1,CULT:14|inc:AGE>=500;cd:12;vg:lon0',
    '51403|你把旧洞府借给一户凡人避雨，他们供了你三百年香火。|sect|1|CHR:3,SPR:2,CULT:12|inc:AGE>=500;cd:12;vg:lon0',
    '51404|坊市换了新秤，灵石的面额比五百年前多了两个零。|resource|1|MNY:3,INT:1,CULT:12|inc:AGE>=500;cd:12;vg:lon0',
    '51405|有人把你的画像刻在渡口，说能保行船不翻，你没去纠正。|explore|1|CHR:2,SPR:2,CULT:14|inc:AGE>=500;cd:12;vg:lon0',
    '51406|第一次有人问你「活这么久会不会累」，你想了三年才答不会。|daily|1|SPR:3,INT:2,CULT:16|inc:AGE>=500;cd:12;vg:lon0',
    '51407|你收的第三批弟子也都坐化了，这一回你没再去送。|relation|2|SPR:-2,INT:4,CULT:18|inc:AGE>=500;cd:12;vg:lon0',
    '51408|一整座城把你写进了县志，年份错得离谱。|sect|1|CHR:2,INT:2|inc:AGE>=500;cd:12;vg:lon0',
    '51409|旧友的转世来山前站了一炷香，没进门，你也没叫住。|relation|2|SPR:2,INT:3,CULT:16|inc:AGE>=500;cd:12;vg:lon0',

    // ── 620+：王朝更迭，自己成了传说 ─────────────────────────────────
    '51410|凡间的国号换了四次，边境的官话你已经听不太懂。|daily|1|INT:3,SPR:-1,CULT:18|inc:AGE>=620;cd:13;vg:lon1',
    '51411|新朝的天子遣使来求长生，你回了四个字：「不必求」。|sect|2|CHR:3,INT:3,CULT:16|inc:AGE>=620;cd:13;vg:lon1',
    '51412|有人替你立了生祠，香火里混着一点很淡的愿力。|resource|2|MNY:3,SPR:2,CULT:20|inc:AGE>=620;cd:13;vg:lon1',
    '51413|你翻出六百年前的一封信，墨迹还在，写信人的坟已平了。|relation|2|SPR:-2,INT:4,CULT:18|inc:AGE>=620;cd:13;vg:lon1',
    '51414|两个宗门为「你当年说过的一句话」打了两百年。|sect|2|CHR:-2,INT:3,CULT:16|inc:AGE>=620;cd:13;vg:lon1',
    '51415|你试着用凡人的身份在镇上住了一年，没人认出你。|explore|2|SPR:3,INT:2,CULT:18|inc:AGE>=620;cd:13;vg:lon1',
    '51416|灵脉改道，你替山下三县把水重新引了回去。|resource|2|MNY:4,CHR:3,CULT:20|inc:AGE>=620;cd:13;vg:lon1',
    '51417|有本游记把你写成了山神，配图画着三只眼。|explore|1|SPR:2,INT:2|inc:AGE>=620;cd:13;vg:lon1',
    '51418|你第一次记不清某位故人的声音，静坐了整整一年。|crisis|2|SPR:-3,INT:5,CULT:20|inc:AGE>=620;cd:13;vg:lon1',
    '51419|一条古仙路在凡间显了形，你绕着它走了三圈没进去。|explore|2|INT:5,CULT:22|inc:AGE>=620;cd:13;vg:lon1',

    // ── 740+：记忆开始磨损 ────────────────────────────────────────────
    '51420|这个年纪你忘了一个字，翻遍识海才想起来是自己的姓。|crisis|2|INT:5,SPR:-3,CULT:22|inc:AGE>=740;cd:14;vg:lon2',
    '51421|你把一生刻成玉简，刻到第三百枚时发现前后对不上。|daily|2|INT:5,SPR:1,CULT:22|inc:AGE>=740;cd:14;vg:lon2',
    '51422|曾经发誓要报的仇，连仇家的名字都想不起来了。|relation|2|SPR:2,INT:4,CULT:20|inc:AGE>=740;cd:14;vg:lon2',
    '51423|有修士专程来问数百年前那场大战，你说「我在场」，然后沉默。|sect|2|CHR:2,INT:4,CULT:20|inc:AGE>=740;cd:14;vg:lon2',
    '51424|你把旧法宝熔了重铸，器灵醒来后不认得你，也没怪你。|resource|2|STR:3,SPR:-2,CULT:22|inc:AGE>=740;cd:14;vg:lon2',
    '51425|凡人开始用「纪」来数年份，第一纪正是你入道那年。|explore|2|INT:4,SPR:2,CULT:20|inc:AGE>=740;cd:14;vg:lon2',
    '51426|你在雪里坐了一百年，起身时雪线比记忆里低了半座山。|daily|2|SPR:2,INT:3,CULT:24|inc:AGE>=740;cd:14;vg:lon2',
    '51427|一位后辈问你「最初为什么修行」，你答得和六百年前不一样。|relation|2|SPR:3,INT:4,CULT:22|inc:AGE>=740;cd:14;vg:lon2',
    '51428|心魔这次不吓你，只把故人的声音一个一个还给你。|crisis|3|SPR:-4,INT:6,CULT:24|inc:AGE>=740;cd:14;vg:lon2',
    '51429|你开始把重要的日子刻在骨头上，怕玉简比自己先碎。|daily|2|STR:2,INT:4,CULT:22|inc:AGE>=740;cd:14;vg:lon2',

    // ── 860+：纪元更替，灵气枯荣 ─────────────────────────────────────
    '51430|这一纪的灵气比上一纪薄了三成，年轻修士管这叫「末法」。|daily|2|INT:5,CULT:24|inc:AGE>=860;cd:15;vg:lon3',
    '51431|你把一整条灵脉封进玉里，留给灵气回来的那一天。|resource|3|MNY:6,INT:5,CULT:26|inc:AGE>=860;cd:15;vg:lon3',
    '51432|有宗门因灵气枯竭散了，你把他们的功法抄了一份带走。|sect|2|INT:5,SPR:-1,CULT:24|inc:AGE>=860;cd:15;vg:lon3',
    '51433|大陆换了形状，你按旧地图走，走进了海里。|explore|2|INT:5,SPR:2,CULT:24|inc:AGE>=860;cd:15;vg:lon3',
    '51434|你见过三次灵气涨落，第三次终于不再为谁惋惜。|dao|3|INT:7,DAO:1,TRIB:10,CULT:26|inc:AGE>=860;cd:15;vg:lon3;dao:枯荣',
    '51435|一整代修士没见过雷劫，把你的旧事当成了神话。|sect|2|CHR:3,INT:4,CULT:22|inc:AGE>=860;cd:15;vg:lon3',
    '51436|你在地层里挖出自己千年前留下的剑，锈得刚好。|explore|3|STR:4,INT:4,CULT:26|inc:AGE>=860;cd:15;vg:lon3',
    '51437|有人算出天地有一次大劫，来问你躲不躲，你说先看看。|crisis|3|SPR:2,INT:6,CULT:26|inc:AGE>=860;cd:15;vg:lon3',
    '51438|你把洞府往下沉了三里，避过了一次纪元之交的地火。|resource|2|MNY:-4,STR:4,CULT:24|inc:AGE>=860;cd:15;vg:lon3',
    '51439|旧日的道盟碑沉进海底，字迹被珊瑚一寸寸盖住。|relation|2|SPR:2,INT:5,CULT:24|inc:AGE>=860;cd:15;vg:lon3',

    // ── 1000+：界外星海，古仙战场 ────────────────────────────────────
    '51440|界壁外漂来半截仙舟，船板上刻的不是这方天地的字。|explore|3|INT:7,STR:3,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51441|你在星海里遇见一位同寿的独行者，两人只交换了年岁。|relation|3|SPR:4,INT:5,CULT:26|inc:AGE>=1000;cd:16;vg:lon4',
    '51442|古战场上还立着一杆没倒的旗，你替它把雪拂了。|explore|3|STR:5,INT:5,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51443|有界外修士问「此界可有人飞升」，你说「还没有」。|sect|3|CHR:3,INT:6,CULT:26|inc:AGE>=1000;cd:16;vg:lon4',
    '51444|你把一缕界外法则引进识海，疼了四百年，也悟了四百年。|dao|3|INT:9,DAO:1,TRIB:12,CULT:30|inc:AGE>=1000;cd:16;vg:lon4;dao:界外',
    '51445|星图上多出一条从未有过的路，尽头正对着你闭关的山。|explore|3|INT:7,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51446|一位散仙输给你的不是道法，是谁更能等。|crisis|3|SPR:3,INT:6,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51447|你替一整片将熄的星域续了口气，没留下名字。|resource|3|MNY:6,SPR:4,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51448|雷云的种类似乎变过一次，你把旧雷谱重订了一遍。|tribulation|3|INT:7,TRIB:14,CULT:28|inc:AGE>=1000;cd:16;vg:lon4',
    '51449|你终于能一眼看完整片星海的起落，却仍看不清仙门后。|dao|3|INT:9,DAO:1,TRIB:12,CULT:30|inc:AGE>=1000;cd:16;vg:lon4;dao:星海',

    // ── 1250+：天道、飞升者与漫长本身（卡关久久不飞升才会看到） ───────
    '51450|有一位飞升者托梦回来说「上面也很安静」，你信了。|explore|3|SPR:3,INT:7,CULT:30|inc:AGE>=1250;cd:18;vg:lon5',
    '51451|你第一次听见天道的声音，它说的和心魔是同一句。|crisis|3|SPR:-3,INT:8,TRIB:12,CULT:30|inc:AGE>=1250;cd:18;vg:lon5',
    '51452|凡界已经没有活人认得你的年代，你反倒自在了些。|relation|3|SPR:4,INT:5,CULT:28|inc:AGE>=1250;cd:18;vg:lon5',
    '51453|你把「还要往上吗」这个问题问了自己一千年，今天不问了。|dao|3|SPR:5,INT:9,DAO:1,TRIB:14,CULT:32|inc:AGE>=1250;cd:18;vg:lon5;dao:问道',
    '51454|时间在你身上留不下东西了，你便自己给自己记年。|daily|3|INT:7,SPR:3,CULT:30|inc:AGE>=1250;cd:18;vg:lon5',
    '51455|第九重雷云在天上悬了三百年不落，你照旧每日煮茶。|tribulation|3|SPR:4,TRIB:16,CULT:30|inc:AGE>=1250;cd:18;vg:lon5',
    '51456|你把一身道法拆成最浅的几句，写在渡口的木牌上。|sect|3|CHR:4,INT:7,CULT:28|inc:AGE>=1250;cd:18;vg:lon5',
    '51457|有后辈问飞升要准备什么，你说「先把该忘的忘干净」。|relation|3|SPR:4,INT:6,CULT:28|inc:AGE>=1250;cd:18;vg:lon5',
    '51458|你终于明白渡劫渡的不是雷，是这么多年不肯放下的自己。|dao|3|SPR:6,INT:9,DAO:1,TRIB:16,CULT:32|inc:AGE>=1250;cd:18;vg:lon5;dao:本心',
    '51459|仙门后的光又亮了一分，你放下茶盏，觉得时候快到了。|explore|3|SPR:5,TRIB:16,CULT:32|inc:AGE>=1250;cd:18;vg:lon5',
]
