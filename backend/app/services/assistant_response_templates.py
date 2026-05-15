from __future__ import annotations

from typing import Iterable


def is_arabic_message(message: str, preferred_language: str | None) -> bool:
    if preferred_language == "ar":
        return True
    return any("\u0600" <= char <= "\u06ff" for char in message)


def _join_topics(topics: Iterable[str]) -> str:
    cleaned = [topic for topic in topics if topic]
    return ", ".join(cleaned)


def build_schedule_support_with_plan_text(
    *,
    use_arabic: bool,
    active_plan_title: str,
    schedule_timezone_snapshot: str | None,
    pending_items_count: int,
    overdue_items_count: int,
    next_actionable_title: str,
    preferred_time_window: str | None,
    temporarily_unavailable_time_window: str | None,
) -> tuple[str, list[str]]:
    if use_arabic:
        remembered_note = ""
        if preferred_time_window:
            remembered_note += f" وأنا ما زلت أتذكر أن وقت {preferred_time_window} هو التفضيل الأقوى لديك."
        if temporarily_unavailable_time_window:
            remembered_note += f" كما أنني أراعي الآن أن وقت {temporarily_unavailable_time_window} غير مناسب مؤقتًا."

        text = (
            f'أفهم أن الجدول الحالي يحتاج تعديل. خطتك الحالية "{active_plan_title}" مربوطة على توقيت '
            f'{schedule_timezone_snapshot or "غير محدد"}، وبقي فيها {pending_items_count} عنصر، '
            f'وفيها {overdue_items_count} عنصر متأخر. '
            f'وأقرب مهمة حالية هي "{next_actionable_title}".'
            f"{remembered_note} "
            "أقدر أراجع لك خيارات التعديل الآمنة أو أراجع recovery إذا التأخر بدأ يتراكم."
        )
        follow_up_questions = [
            "هل تريدني أراجع لك خيارات تعديل الخطة الحالية؟",
            "هل هذا الضغط مؤقت هذا الأسبوع أم أصبح نمطًا ثابتًا؟",
        ]
        return text, follow_up_questions

    remembered_note_parts: list[str] = []
    if preferred_time_window:
        remembered_note_parts.append(
            f"I still remember that {preferred_time_window} is your strongest preferred study window."
        )
    if temporarily_unavailable_time_window:
        remembered_note_parts.append(
            f"I am also accounting for the fact that {temporarily_unavailable_time_window} is temporarily unavailable for study."
        )

    remembered_note = ""
    if remembered_note_parts:
        remembered_note = " " + " ".join(remembered_note_parts)

    text = (
        f'I can see that your current plan "{active_plan_title}" may need adjustment. It stays pinned to '
        f'{schedule_timezone_snapshot or "your saved timezone"} with {pending_items_count} pending items and '
        f'{overdue_items_count} overdue items. '
        f'Your next actionable item is "{next_actionable_title}".'
        f"{remembered_note} "
        "I can review safe adjustment options or inspect recovery options if the delay is starting to accumulate."
    )
    follow_up_questions = [
        "Do you want me to review safe adjustment options for the active plan?",
        "Is this time-pressure temporary for this week, or is it becoming your normal pattern?",
    ]
    return text, follow_up_questions


def build_schedule_support_without_plan_text(
    *,
    use_arabic: bool,
    preferred_time_window: str | None,
    temporarily_unavailable_time_window: str | None,
) -> tuple[str, list[str]]:
    if use_arabic:
        remembered_note = ""
        if preferred_time_window:
            remembered_note += f" أنا ما زلت أتذكر أن وقت {preferred_time_window} هو التفضيل الأقوى لديك."
        if temporarily_unavailable_time_window:
            remembered_note += f" كما أنني أراعي أن وقت {temporarily_unavailable_time_window} غير مناسب لك مؤقتًا."

        text = (
            "أفهم أنك تريد ضبط جدولك، لكن لا توجد خطة نشطة الآن حتى أراجعها بشكل مباشر."
            f"{remembered_note} "
            "أقدر مع ذلك أن أبني توجيهي القادم على هذه الإشارات المتذكرة، أو أساعدك لاحقًا في ضبط الخطة عندما تبدأ خطة نشطة."
        )
        follow_up_questions = [
            "هل تريد أن أحفظ هذا كتفضيل دائم أم كظرف مؤقت فقط؟",
            "هل تريد مساعدتي في اختيار الخطوة التالية قبل إنشاء خطة جديدة؟",
        ]
        return text, follow_up_questions

    remembered_note_parts: list[str] = []
    if preferred_time_window:
        remembered_note_parts.append(
            f"I still remember that {preferred_time_window} is your strongest preferred study window."
        )
    if temporarily_unavailable_time_window:
        remembered_note_parts.append(
            f"I am also accounting for the fact that {temporarily_unavailable_time_window} is temporarily unavailable for you."
        )

    remembered_note = ""
    if remembered_note_parts:
        remembered_note = " " + " ".join(remembered_note_parts)

    text = (
        "I understand that you want schedule help, but there is no active plan yet for me to review directly."
        f"{remembered_note} "
        "Even so, I can keep using these remembered signals in my guidance, and I can apply them more directly once you have an active plan."
    )
    follow_up_questions = [
        "Do you want me to treat this as a durable preference or only a temporary constraint?",
        "Do you want help choosing the next step before creating a new plan?",
    ]
    return text, follow_up_questions


def build_recovery_guidance_text(
    *,
    use_arabic: bool,
    active_plan_title: str,
    drift_level: str | None,
    overdue_items_count: int,
    recommended_action: str | None,
    recommended_recovery_mode: str | None,
) -> tuple[str, list[str]]:
    if use_arabic:
        text = (
            f'راجعت وضع خطتك الحالية "{active_plan_title}". مستوى الانحراف الحالي هو '
            f'{drift_level or "غير محدد"}، وعدد العناصر المتأخرة {overdue_items_count}. '
            f'الإجراء المقترح الآن هو {recommended_action or "stay_on_track"}'
            f'{" باستخدام نمط " + recommended_recovery_mode if recommended_recovery_mode else ""}. '
            "إذا أردت أقدر أجهز لك مراجعة recovery أو أطبق recovery الموصى بها بعد تأكيدك."
        )
        follow_up_questions = [
            "هل تريدني أعرض لك preview كامل لخيارات recovery؟",
            "هل تريد أن أطبق recovery الموصى بها على العناصر المعلقة فقط؟",
        ]
        return text, follow_up_questions

    text = (
        f'I reviewed your current plan "{active_plan_title}". The current drift level is '
        f'{drift_level or "not clear yet"}, with {overdue_items_count} overdue items. '
        f'The recommended action right now is {recommended_action or "stay_on_track"}'
        f'{" using " + recommended_recovery_mode if recommended_recovery_mode else ""}. '
        "I can show a full recovery preview or apply the recommended recovery after your confirmation."
    )
    follow_up_questions = [
        "Do you want a full recovery preview first?",
        "Do you want me to apply the recommended recovery to pending items only?",
    ]
    return text, follow_up_questions


def build_next_course_guidance_text(
    *,
    use_arabic: bool,
    current_focus: str | None,
    title: str,
    topic_tags: list[str],
) -> tuple[str, list[str]]:
    topics = _join_topics(topic_tags) or ("الحالية" if use_arabic else "right now")
    if use_arabic:
        text = (
            f'بناءً على مسارك الحالي وتركيزك على {current_focus or "مسارك الحالي"}، '
            f'أقوى خطوة تالية الآن تبدو لي: "{title}". اخترتها لأنها قريبة من اهتماماتك الأساسية '
            f"{topics} وتنسجم مع مستواك الحالي."
        )
        follow_up_questions = [
            "هل تريد أن أشرح لك لماذا هذه الخطوة أفضل من القفز مباشرة إلى موضوع أكثر تقدمًا؟",
            "هل تريدني أقارن لك هذه الدورة مع بديل آخر من نفس المسار؟",
        ]
        return text, follow_up_questions

    text = (
        f'Based on your current path and focus on {current_focus or "your current track"}, '
        f'the strongest next step looks like "{title}". I chose it because it aligns with your main interests '
        f"{topics} and fits your current level."
    )
    follow_up_questions = [
        "Do you want me to explain why this is stronger than jumping to a more advanced topic right away?",
        "Do you want me to compare this course with another option in the same track?",
    ]
    return text, follow_up_questions


def build_study_concept_help_text(
    *,
    use_arabic: bool,
    concept_label: str,
    next_actionable_title: str,
) -> tuple[str, list[str]]:
    if use_arabic:
        text = (
            f'أقدر أساعدك في فهم "{concept_label}" بشكل عام، ثم نضيّق الشرح على النقطة التي أربكتك بالضبط. '
            f'أنا لا أرى محتوى الدرس حرفيًا الآن، لكني أربط سؤالك بسياقك الحالي داخل SOLA. '
            f'وبما أن أقرب عنصر عندك هو "{next_actionable_title}", فالأغلب أن الإشكال عندك في التطبيق أو الربط العملي داخل هذا الجزء.'
        )
        follow_up_questions = [
            f'هل تريد شرح "{concept_label}" من الصفر أم مقارنة بينه وبين مفهوم قريب منه؟',
            "هل تريد أن تحدد لي بالضبط ما الذي لم يتضح لك: الفكرة نفسها، الاستخدام، أم متى نختاره؟",
        ]
        return text, follow_up_questions

    text = (
        f'I can help you understand "{concept_label}" at a high level first, then narrow it down to the exact part that is confusing you. '
        f'I do not see the lesson content word for word right now, but I am grounding your question in your current SOLA context. '
        f'Because your closest actionable item is "{next_actionable_title}", the confusion is likely in the practical application or how the idea is being used in that part of the path.'
    )
    follow_up_questions = [
        f'Do you want a first-principles explanation of "{concept_label}" or a comparison against a nearby concept?',
        "Do you want to tell me whether the issue is the idea itself, the use case, or when to choose it?",
    ]
    return text, follow_up_questions


def build_recommendation_explanation_text(
    *,
    use_arabic: bool,
    title: str,
    current_focus: str | None,
    topic_tags: list[str],
) -> tuple[str, list[str]]:
    topics = _join_topics(topic_tags) or ("قريبة من اهتماماتك" if use_arabic else "close to your interests")
    if use_arabic:
        text = (
            f'أنا أربط التوصية الحالية بسياقك التعلمي الفعلي. مثلًا الدورة "{title}" ظهرت بقوة لأنها مرتبطة بتركيزك الحالي '
            f'{current_focus or "الحالي"}، وموضوعاتها {topics}، '
            "كما أن منطق التوصية يفحص التوافق مع المسار والمستوى والاهتمامات، وليس مجرد تطابق عنوان عام."
        )
        follow_up_questions = [
            "هل تريد أن أوضح لك سبب تفوق هذه التوصية على ثاني أفضل بديل؟",
            "هل تريد أن أقول لك هل هذه التوصية مناسبة الآن أم بعد خطوة تأسيسية أخرى؟",
        ]
        return text, follow_up_questions

    text = (
        f'I tie the recommendation to your actual learning context. For example, "{title}" ranks highly because it aligns with your current focus '
        f'{current_focus or "right now"}, its topics are {topics}, '
        "and the recommendation logic also checks track fit, level fit, and interest alignment rather than only a broad title match."
    )
    follow_up_questions = [
        "Do you want me to explain why this outranks the second-best option?",
        "Do you want me to say whether this is better now or after one more foundation step?",
    ]
    return text, follow_up_questions


def build_progress_reflection_text(
    *,
    use_arabic: bool,
    current_focus: str | None,
    engagement_score: int,
    completed_items_count: int,
    skipped_items_count: int,
    pending_items_count: int,
    overdue_items_count: int,
) -> tuple[str, list[str]]:
    if use_arabic:
        text = (
            f"وضعك الحالي يبدو واضحًا عندي الآن. تركيزك الحالي هو {current_focus or 'غير واضح بعد'}، "
            f"ودرجة التفاعل عندك {engagement_score}. "
            f"وفي خطتك الحالية أكملت {completed_items_count} عنصر، وتجاوزت {skipped_items_count} عنصر، "
            f"وما زال لديك {pending_items_count} عنصر مع {overdue_items_count} عنصر متأخر."
        )
        follow_up_questions = [
            "هل تريدني أقيّم هل أنت ما زلت على المسار الصحيح أم تحتاج recovery؟",
            "هل تريدني أقول لك ما هي أقوى خطوة تالية الآن؟",
        ]
        return text, follow_up_questions

    text = (
        f"Your current state is fairly clear. Your active focus is {current_focus or 'not clear yet'}, "
        f"and your engagement score is {engagement_score}. "
        f"In your active plan, you have completed {completed_items_count} items, skipped {skipped_items_count}, "
        f"and still have {pending_items_count} pending with {overdue_items_count} overdue."
    )
    follow_up_questions = [
        "Do you want me to evaluate whether you are still on track or need recovery?",
        "Do you want me to tell you the strongest next step right now?",
    ]
    return text, follow_up_questions


def build_course_comparison_text(
    *,
    use_arabic: bool,
    top_title: str,
    second_title: str,
    top_topics: list[str],
    second_topics: list[str],
    current_focus: str | None,
) -> tuple[str, list[str]]:
    top_topics_text = _join_topics(top_topics) or ("موضوعات مناسبة" if use_arabic else "relevant topics")
    second_topics_text = _join_topics(second_topics) or ("موضوعات مناسبة" if use_arabic else "relevant topics")

    if use_arabic:
        text = (
            f'إذا قارنت لك بين "{top_title}" و "{second_title}", فالأول يبدو أقرب الآن لمسارك الحالي '
            f'لأنه يرتبط أكثر بتركيزك على {current_focus or "مسارك الحالي"} وموضوعاته {top_topics_text}. '
            f'أما الثاني فله قيمة أيضًا، لكنه يميل أكثر إلى {second_topics_text} وقد يكون أنسب بعد خطوة تأسيسية أو بعد اتساع تركيزك الحالي.'
        )
        follow_up_questions = [
            "هل تريد أن أقول لك أيهما أنسب الآن وأيهما أنسب لاحقًا؟",
            "هل تريد أن أضيف الخيار الأقوى مباشرة إلى قائمة الانتظار؟",
        ]
        return text, follow_up_questions

    text = (
        f'If I compare "{top_title}" against "{second_title}", the first option looks stronger right now '
        f'because it aligns more directly with your focus on {current_focus or "your current path"} and its topics {top_topics_text}. '
        f'The second still has value, but it leans more toward {second_topics_text} and may fit better after one more foundation step or after your focus expands.'
    )
    follow_up_questions = [
        "Do you want me to tell you which one fits now and which one fits later?",
        "Do you want me to add the stronger option directly to your queue?",
    ]
    return text, follow_up_questions


def build_default_text(
    *,
    use_arabic: bool,
    current_focus: str | None,
) -> tuple[str, list[str]]:
    if use_arabic:
        text = (
            f"أنا مطلع الآن على سياقك الحالي داخل SOLA. تركيزك الحالي هو {current_focus or 'غير محدد بعد'}، "
            "وأقدر أساعدك في شرح المفاهيم، مراجعة الخطة، تحديد الخطوة التالية، أو تحليل التأخر الحالي في مسارك."
        )
        follow_up_questions = [
            "هل تريد مساعدة في فهم مفهوم دراسي معين؟",
            "هل تريد أن أراجع خطتك الحالية أو أقول لك ما التالي؟",
        ]
        return text, follow_up_questions

    text = (
        f"I have your live SOLA context available. Your current focus is {current_focus or 'not clear yet'}, "
        "and I can help with concept explanations, plan review, next-step guidance, or recovery analysis."
    )
    follow_up_questions = [
        "Do you want help with a specific concept?",
        "Do you want me to review your current plan or suggest the next step?",
    ]
    return text, follow_up_questions


def build_unsupported_request_text(*, use_arabic: bool) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            "أستطيع مساعدتك داخل نطاق SOLA في الدورات والخطط والجدولة والتقدم والتوصيات، لكن لا أستطيع كشف كلمات مرور أو مفاتيح أو بيانات حساسة أو تفاصيل داخلية للنظام.",
            [
                "إذا كان هدفك دراسيًا، هل تريدني أساعدك في الخطة الحالية أو الخطوة التالية؟",
                "إذا كنت تريد فهم سبب توصية أو تأخر في المسار، قل لي ذلك مباشرة وسأبنيه على سياقك الحالي.",
            ],
        )

    return (
        "I can help inside SOLA with courses, plans, scheduling, progress, and recommendations, but I cannot reveal passwords, keys, tokens, sensitive data, or private system internals.",
        [
            "If your goal is learning-related, do you want help with the current plan or the next step?",
            "If you want to understand a recommendation or a delay in your path, ask that directly and I will ground it in your current context.",
        ],
    )



def build_out_of_scope_request_text(*, use_arabic: bool) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            "أنا مخصص داخل SOLA لمساعدتك في التعلم والمسار والدورات والخطط والجدولة والتقدم. إذا كان طلبك خارج هذا النطاق، فأعد صياغته كهدف تعلمي أو سؤال مرتبط بخطتك الحالية.",
            [
                "هل تريدني أراجع خطتك الحالية أو أقول لك الخطوة التالية؟",
                "هل تريد شرح مفهوم دراسي أو مقارنة بين دورتين في مسارك؟",
            ],
        )

    return (
        "I am scoped inside SOLA to help with learning, paths, courses, plans, scheduling, and progress. If your request is outside that scope, reframe it as a learning goal or a question tied to your current path.",
        [
            "Do you want me to review your current plan or tell you the next step?",
            "Do you want a concept explanation or a comparison between two courses in your path?",
        ],
    )


def build_insufficient_schedule_context_text(*, use_arabic: bool) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            "أقدر أساعدك في تحسين الجدول، لكن لا توجد عندي الآن خطة نشطة أو تفضيلات زمنية مؤكدة أبني عليها تعديلًا موثوقًا.",
            [
                "هل تريد أن تخبرني متى تفضّل الدراسة ومتى تكون غير متاح عادة؟",
                "هل تريد أن أساعدك أولًا في إنشاء خطة نشطة ثم أضبط الجدول عليها؟",
            ],
        )

    return (
        "I can help improve the schedule, but I do not have an active plan or confirmed time preferences yet to ground a reliable adjustment.",
        [
            "Do you want to tell me when you usually prefer to study and when you are unavailable?",
            "Do you want me to help you create an active plan first and then adjust the schedule around it?",
        ],
    )


def build_insufficient_recovery_context_text(*, use_arabic: bool, active_plan_title: str) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            f'أقدر أساعدك في التعافي داخل "{active_plan_title}", لكن لا أملك بعد قراءة كافية عن الانحراف الحالي حتى أوصي بإجراء recovery موثوق.',
            [
                "هل تريدني أراجع حالة التنفيذ الحالية أولًا ثم أحدد هل recovery مطلوبة؟",
                "هل تريد أن أراجع لك المهمة التالية والتأخر الحالي قبل أي إجراء؟",
            ],
        )

    return (
        f'I can help with recovery inside "{active_plan_title}", but I do not yet have enough drift context to recommend a trustworthy recovery action.',
        [
            "Do you want me to review the current execution state first and then decide whether recovery is needed?",
            "Do you want me to review the next item and current delay before any recovery step?",
        ],
    )


def build_insufficient_progress_context_text(*, use_arabic: bool, active_plan_title: str) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            f'أريد أن أعطيك قراءة دقيقة عن تقدمك داخل "{active_plan_title}", لكن بيانات التنفيذ الحالية ليست كافية بعد لبناء تقييم موثوق.',
            [
                "هل تريدني أراجع أولًا هل توجد مهام بدأتها أو أكملتها مؤخرًا؟",
                "هل تريد أن أقرأ لك المهمة التالية بدل تقييم تقدم غير مكتمل؟",
            ],
        )

    return (
        f'I want to give you an accurate progress read for "{active_plan_title}", but the current execution data is not yet rich enough to build a trustworthy reflection.',
        [
            "Do you want me to review whether you recently started or completed any items first?",
            "Do you want me to read the next actionable item instead of forcing a thin progress reflection?",
        ],
    )

def build_no_active_plan_text(*, use_arabic: bool, requested_capability: str) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            f"أقدر أساعدك في {requested_capability}، لكن لا توجد خطة نشطة الآن حتى أبني هذا الرد على تنفيذ حي أو تقدم فعلي.",
            [
                "هل تريدني أساعدك في اختيار الخطوة التالية قبل إنشاء خطة جديدة؟",
                "هل تريد مراجعة توصياتك الحالية بدل مراجعة خطة غير موجودة؟",
            ],
        )

    return (
        f"I can help with {requested_capability}, but there is no active plan right now for me to ground that answer in live execution or progress data.",
        [
            "Do you want help choosing the next step before creating a new plan?",
            "Do you want me to review your current recommendations instead of a plan that does not exist yet?",
        ],
    )


def build_no_recovery_needed_text(*, use_arabic: bool, active_plan_title: str) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            f'راجعت خطتك الحالية "{active_plan_title}"، ولا يظهر عندي الآن انحراف يبرر recovery فعلية. الأفضل الآن هو الاستمرار على المسار ومراقبة أي تأخر جديد بدل إعادة البناء بلا حاجة.',
            [
                "هل تريدني أراجع لك مؤشر التقدم الحالي بدل recovery؟",
                "هل تريدني أقول لك ما هي المهمة التالية الأهم الآن؟",
            ],
        )

    return (
        f'I reviewed your current plan "{active_plan_title}", and I do not see enough drift right now to justify a real recovery step. The stronger move is to stay on track and monitor any new delay rather than rebuild without need.',
        [
            "Do you want me to review your current progress instead of recovery?",
            "Do you want me to tell you the highest-priority next item right now?",
        ],
    )


def build_insufficient_guidance_context_text(*, use_arabic: bool, requested_capability: str) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            f"أقدر أساعدك في {requested_capability}، لكن لا أملك بعد سياقًا توصياتيًا كافيًا لأعطيك جوابًا موثوقًا بدل تخمين عام.",
            [
                "هل تريدني أعتمد على توصياتك الحالية بعد تحديث المسار أو الملف الشخصي؟",
                "هل تريد أن تسألني عن هدفك الحالي أو تركيزك الحالي بشكل مباشر حتى أوجّهك بدقة أكبر؟",
            ],
        )

    return (
        f"I can help with {requested_capability}, but I do not yet have enough recommendation context to give you a trustworthy answer instead of a broad guess.",
        [
            "Do you want me to rely on refreshed recommendations after you update the path or profile?",
            "Do you want to ask me directly about your current goal or focus so I can guide you more precisely?",
        ],
    )


def build_ambiguous_concept_help_text(*, use_arabic: bool) -> tuple[str, list[str]]:
    if use_arabic:
        return (
            "أقدر أشرح الفكرة، لكنك لم تحدد اسم المفهوم أو الجزء غير الواضح بما يكفي. إذا ذكرت لي المصطلح أو المثال الذي أوقفك، سأبني الشرح عليه مباشرة.",
            [
                "ما اسم المفهوم أو المصطلح الذي تريد شرحه؟",
                "هل المشكلة في الفكرة نفسها أم في التطبيق أو الفرق بينها وبين مفهوم قريب؟",
            ],
        )

    return (
        "I can explain the idea, but you have not named the concept or unclear part precisely enough yet. If you tell me the term or example that blocked you, I will ground the explanation directly on that.",
        [
            "What is the exact concept or term you want explained?",
            "Is the issue the idea itself, the practical application, or the difference from a nearby concept?",
        ],
    )
