import type { TranslationCatalog } from "./i18n";

/** Строки плагина «Компаньон»: ключи `companion.*`, пары [ru, en]. */
export const companionMessages = {
  // ── Ошибки main ──
  "companion.toast.close": ["Закрыть", "Close"],
  "companion.error.invalidPath": ["Некорректный путь файла.", "Invalid file path."],
  "companion.error.projectMissing": ["Папка проекта не найдена.", "The project folder was not found."],
  "companion.error.notFile": ["{path} не файл.", "{path} is not a file."],
  "companion.error.tooLarge": ["Файл {path} слишком большой для редактора.", "{path} is too large for the editor."],
  "companion.error.binary": ["{path} похож на бинарный файл.", "{path} looks like a binary file."],
  "companion.error.changedOutside": [
    "Файл {path} изменился на диске, пока был открыт.",
    "{path} changed on disk while it was open.",
  ],
  "companion.error.emptyGoal": ["Опишите, что нужно сделать.", "Describe what to do."],
  "companion.error.invalidInput": ["Некорректный запрос.", "Invalid request."],
  "companion.error.taskMissing": ["Задача не найдена.", "The task was not found."],
  "companion.error.noMoreHints": [
    "Подсказки к этому месту закончились. Можно открыть решение.",
    "No more hints for this spot. You can reveal the solution.",
  ],
  "companion.error.planNoSlots": [
    "Агент не оставил в плане мест для вашего кода. Попробуйте ещё раз или уточните цель.",
    "The agent left no places for your code in the plan. Try again or refine the goal.",
  ],
  "companion.error.planCancelled": ["Планирование остановлено.", "Planning was stopped."],

  // ── Уведомления ──
  "companion.toast.loadFailed": ["Не удалось загрузить задачи", "Could not load tasks"],
  "companion.toast.failed": ["Компаньон не справился", "The companion ran into a problem"],
  "companion.toast.saveFailed": ["Файл не сохранён", "The file was not saved"],
  "companion.toast.reviewFailed": ["Проверка не удалась", "The review failed"],
  "companion.toast.hintFailed": ["Подсказка не пришла", "Could not get a hint"],
  "companion.toast.askFailed": ["Агент не ответил", "The agent did not answer"],
  "companion.toast.repairFailed": ["Агент не смог поправить код шага", "The agent could not fix the step"],

  // ── Сайдбар ──
  "companion.sidebar.new": ["Новая задача", "New task"],
  "companion.sidebar.newExercise": ["Упражнение", "Exercise"],
  "companion.sidebar.projects": ["В проектах", "In projects"],
  "companion.sidebar.exercises": ["Упражнения", "Exercises"],
  "companion.sidebar.empty": ["Задач пока нет", "No tasks yet"],
  "companion.sidebar.progress": ["{done} из {total}", "{done} of {total}"],

  // ── Пустой экран ──
  "companion.empty.title": ["Пишите код сами, агент рядом", "Write the code yourself, with the agent by your side"],
  "companion.empty.body": [
    "Агент разобьёт задачу на шаги, откроет в файлах места для вашего кода, подскажет и аккуратно проверит. Сколько писать самому, решаете вы.",
    "The agent splits the task into steps, opens spots in your files for you to write, gives hints and reviews gently. You decide how much to write yourself.",
  ],
  "companion.empty.newTask": ["Задача в проекте", "Task in a project"],
  "companion.empty.newExercise": ["Упражнение", "Exercise"],

  // ── Уровни и доля участия ──
  "companion.level.novice": ["Новичок", "Beginner"],
  "companion.level.middle": ["Мидл", "Intermediate"],
  "companion.level.senior": ["Сеньор", "Senior"],
  "companion.level.noviceNote": [
    "Маленькие шаги, объяснение понятий, подсказки с примерами.",
    "Small steps, concepts explained, hints with examples.",
  ],
  "companion.level.middleNote": [
    "Шаги среднего размера, намёки и идиоматичный код.",
    "Medium steps, nudges and idiomatic code.",
  ],
  "companion.level.seniorNote": [
    "Крупные шаги-цели, минимум подсказок, разбор граничных случаев.",
    "Big goal-sized steps, few hints, focus on edge cases.",
  ],
  "companion.involvement.all": ["Всё сам", "All of it"],
  "companion.involvement.part": ["Главное", "The core"],
  "companion.involvement.minimal": ["Пару строк", "A few lines"],
  "companion.involvement.allNote": [
    "Весь код пишете вы, агент ведёт и проверяет.",
    "You write all the code; the agent guides and reviews.",
  ],
  "companion.involvement.partNote": [
    "Агент пишет обвязку, вы пишете логику.",
    "The agent writes the scaffolding; you write the logic.",
  ],
  "companion.involvement.minimalNote": [
    "Агент пишет почти всё и оставляет короткие пропуски.",
    "The agent writes nearly everything and leaves short gaps.",
  ],

  // ── Новая задача ──
  "companion.new.title": ["Новая задача", "New task"],
  "companion.new.exerciseTitle": ["Новое упражнение", "New exercise"],
  "companion.new.kindProject": ["В проекте", "In a project"],
  "companion.new.kindSandbox": ["Упражнение", "Exercise"],
  "companion.new.project": ["Проект", "Project"],
  "companion.new.pickProject": ["Выберите проект", "Pick a project"],
  "companion.new.noProjects": [
    "Проектов пока нет. Добавьте папку в режиме «Чат».",
    "No projects yet. Add a folder in Chat mode.",
  ],
  "companion.new.goal": ["Что сделать", "What to do"],
  "companion.new.goalPlaceholder": [
    "Например: добавить в форму входа проверку email",
    "For example: validate the email in the sign-in form",
  ],
  "companion.new.topic": ["Тема", "Topic"],
  "companion.new.topicPlaceholder": [
    "Например: рекурсия, словари, асинхронный код",
    "For example: recursion, maps, async code",
  ],
  "companion.new.language": ["Язык", "Language"],
  "companion.new.otherLanguage": ["Другой…", "Other…"],
  "companion.new.otherLanguagePlaceholder": ["Например, Elixir", "For example, Elixir"],
  "companion.new.level": ["Уровень", "Level"],
  "companion.new.involvement": ["Сколько кода пишете вы", "How much code you write"],
  "companion.new.difficulty": ["Сложность", "Difficulty"],
  "companion.new.sandboxMode": [
    "Режим обучения: агент пишет обвязку, а логику пишете вы. Код можно запускать прямо здесь.",
    "Learning mode: the agent writes the scaffolding and you write the logic. You can run the code right here.",
  ],
  "companion.difficulty.novice": ["Лёгкая", "Easy"],
  "companion.difficulty.middle": ["Средняя", "Medium"],
  "companion.difficulty.senior": ["Сложная", "Hard"],
  "companion.difficulty.noviceNote": [
    "Базовые конструкции, понятия с объяснением, подсказки с примерами.",
    "Basic constructs, concepts explained, hints with examples.",
  ],
  "companion.difficulty.middleNote": [
    "Задачи посложнее, намёки вместо готовых примеров.",
    "Harder problems, nudges instead of ready examples.",
  ],
  "companion.difficulty.seniorNote": [
    "Нетривиальные задачи, граничные случаи и производительность.",
    "Non-trivial problems, edge cases and performance.",
  ],
  "companion.run.button": ["Запустить", "Run"],
  "companion.run.title": ["Вывод", "Output"],
  "companion.run.close": ["Скрыть вывод", "Hide output"],
  "companion.run.empty": ["Программа ничего не напечатала.", "The program printed nothing."],
  "companion.run.exit": ["Код выхода {code} · {seconds} с", "Exit code {code} · {seconds} s"],
  "companion.run.killed": ["Остановлено по таймауту 10 с", "Stopped after the 10 s timeout"],
  "companion.run.truncated": ["Вывод обрезан.", "Output truncated."],
  "companion.run.failed": ["Не удалось запустить код", "Could not run the code"],
  "companion.run.unsupported": [
    "Файл {path} нельзя запустить отсюда: поддерживаются Python, JavaScript, TypeScript, Go, Ruby и PHP.",
    "{path} cannot be run here: Python, JavaScript, TypeScript, Go, Ruby and PHP are supported.",
  ],
  "companion.run.missingRuntime": [
    "Не найдена команда {command}. Установите её и перезапустите приложение.",
    "Command {command} was not found. Install it and restart the app.",
  ],
  "companion.run.sandboxOnly": ["Запуск доступен только в упражнениях.", "Running code is available in exercises only."],
  "companion.new.create": ["Начать", "Start"],
  "companion.new.cancel": ["Отмена", "Cancel"],
  "companion.new.close": ["Закрыть", "Close"],

  // ── Планирование ──
  "companion.planning.title": ["Агент готовит план", "The agent is planning"],
  "companion.planning.project": [
    "Изучает проект и разбивает задачу на шаги.",
    "Studying the project and splitting the task into steps.",
  ],
  "companion.planning.sandbox": ["Готовит упражнение.", "Preparing the exercise."],
  "companion.planning.stop": ["Остановить", "Stop"],
  "companion.planning.waiting": ["Запускаю агента…", "Starting the agent…"],
  "companion.planning.log": ["Как агент составлял план", "How the agent planned"],
  "companion.planning.logCount": ["{count} этапов", "{count} stages"],
  "companion.activity.thinking": ["Размышляет", "Thinking"],
  "companion.activity.thought": ["Размышление", "Thought"],
  "companion.activity.thoughtFor": ["Размышлял {duration}", "Thought for {duration}"],
  "companion.activity.answer": ["Ответ", "Answer"],
  "companion.activity.tool": ["Инструмент", "Tool"],
  "companion.activity.show": ["Показать этапы", "Show stages"],
  "companion.activity.hide": ["Скрыть этапы", "Hide stages"],
  "companion.usage.short": ["{tokens} токенов", "{tokens} tokens"],
  "companion.usage.input": ["Отправлено модели: {tokens} токенов", "Sent to the model: {tokens} tokens"],
  "companion.usage.requests": ["Запросов к модели: {count}", "Model requests: {count}"],
  "companion.usage.plan": ["Из них на планирование: {tokens}", "Planning: {tokens}"],
  "companion.usage.context": ["Контекст сейчас: {used} из {max}", "Context now: {used} of {max}"],
  "companion.usage.outputMissing": [
    "Считается только вход запросов: ответы модели CLI не учитывает.",
    "Only request input is counted: the CLI does not report model output.",
  ],
  "companion.model.label": ["Модель агента", "Agent model"],
  "companion.model.loading": ["Модели загружаются…", "Loading models…"],
  "companion.model.default": ["По умолчанию ({name})", "Default ({name})"],
  "companion.model.defaultPlain": ["По умолчанию", "Default"],
  "companion.model.failed": ["Не удалось загрузить модели: {error}", "Could not load models: {error}"],
  "companion.model.retry": ["Повторить", "Retry"],
  "companion.model.changed": [
    "Модель сменится со следующего запроса к агенту.",
    "The model changes with the next request to the agent.",
  ],
  "companion.failed.title": ["План не получился", "Planning failed"],
  "companion.failed.retry": ["Попробовать ещё раз", "Try again"],

  // ── Задача ──
  "companion.task.stepOf": ["Шаг {current} из {total}", "Step {current} of {total}"],
  "companion.task.openFolder": ["Открыть папку", "Open folder"],
  "companion.task.delete": ["Удалить задачу", "Delete task"],
  "companion.task.deleteConfirm": [
    "Удалить задачу «{title}»? Файлы проекта останутся как есть.",
    "Delete the task “{title}”? Project files stay as they are.",
  ],
  "companion.task.deleteSandboxConfirm": [
    "Удалить упражнение «{title}» вместе с его папкой?",
    "Delete the exercise “{title}” together with its folder?",
  ],
  "companion.task.done": ["Задача выполнена", "Task complete"],
  "companion.task.doneBody": [
    "Все шаги закрыты. Можно взять следующую задачу.",
    "All steps are closed. Time for the next task.",
  ],
  "companion.task.goToStep": ["Перейти к шагу {index}", "Go to step {index}"],

  // ── Редактор ──
  "companion.editor.syntaxError": ["Похоже, здесь синтаксическая ошибка.", "This looks like a syntax error."],
  "companion.editor.loading": ["Открываю файлы…", "Opening files…"],
  "companion.editor.saving": ["Сохраняю…", "Saving…"],
  "companion.editor.saved": ["Сохранено", "Saved"],
  "companion.editor.agentWrote": [
    "Агент добавил свой код, файлов: {count}. Ваши места подсвечены.",
    "The agent added its code to {count} file(s). Your spots are highlighted.",
  ],
  "companion.editor.failedEdits": [
    "Код агента для этого шага не встаёт в файлы: они изменились.",
    "The agent's code for this step no longer fits the files: they changed.",
  ],
  "companion.editor.repair": ["Попросить агента поправить", "Ask the agent to fix it"],
  "companion.editor.lostSlots": [
    "Часть мест для кода потерялась: файл изменили снаружи. Проверка всё равно посмотрит файл целиком.",
    "Some code spots were lost because the file changed outside. The review still reads the whole file.",
  ],
  "companion.editor.conflict": ["Файл {path} изменился на диске.", "{path} changed on disk."],
  "companion.editor.reload": ["Перечитать с диска", "Reload from disk"],
  "companion.editor.overwrite": ["Оставить мою версию", "Keep my version"],
  "companion.editor.noFiles": ["У этого шага нет файлов.", "This step has no files."],
  "companion.editor.locked": ["Править можно только подсвеченные места", "Only the highlighted spots are editable"],

  // ── Шаг ──
  "companion.step.slots": ["Что написать", "What to write"],
  "companion.step.slotEmpty": ["пусто", "empty"],
  "companion.step.slotFilled": ["написано", "written"],
  "companion.step.agentStep": [
    "Этот шаг агент сделал сам. Посмотрите код и идите дальше.",
    "The agent did this step itself. Look through the code and move on.",
  ],
  "companion.step.check": ["Проверить", "Check"],
  "companion.step.checking": ["Проверяю…", "Checking…"],
  "companion.step.hint": ["Подсказка: {rung}", "Hint: {rung}"],
  "companion.step.rung.nudge": ["намёк", "nudge"],
  "companion.step.rung.concept": ["понятие", "concept"],
  "companion.step.rung.pseudo": ["псевдокод", "pseudo-code"],
  "companion.step.rung.snippet": ["фрагмент кода", "code fragment"],
  "companion.step.noMoreHints": ["Подсказки закончились", "No more hints"],
  "companion.step.reveal": ["Показать решение", "Reveal solution"],
  "companion.step.revealConfirm": [
    "Показать решение? Код агента заменит то, что написано в местах этого шага.",
    "Reveal the solution? The agent's code replaces what you wrote in this step's spots.",
  ],
  "companion.step.revealLocked": ["Сначала возьмите подсказку", "Take a hint first"],
  "companion.step.letAgent": ["Пусть агент сделает", "Let the agent do it"],
  "companion.step.skip": ["Пропустить", "Skip"],
  "companion.step.next": ["Дальше", "Next"],
  "companion.step.markDone": ["Отметить выполненным", "Mark as done"],
  "companion.step.hints": ["Подсказки", "Hints"],
  "companion.step.stop": ["Остановить", "Stop"],
  "companion.step.thinking": ["Агент думает…", "The agent is thinking…"],
  "companion.step.status.done": ["Готово", "Done"],
  "companion.step.status.skipped": ["Пропущен", "Skipped"],
  "companion.step.status.agent": ["Сделал агент", "Done by the agent"],
  "companion.step.forAll": ["ко всему шагу", "for the whole step"],

  // ── Проверка ──
  "companion.review.ok": ["Всё верно!", "Looks right!"],
  "companion.review.almost": ["Почти!", "Almost!"],
  "companion.review.wrong": ["Пока не то", "Not there yet"],
  "companion.review.jump": ["Показать в коде", "Show in code"],

  // ── Вопросы ──
  "companion.ask.title": ["Спросить агента", "Ask the agent"],
  "companion.ask.placeholder": ["Почему здесь словарь, а не список?", "Why a map here and not a list?"],
  "companion.ask.send": ["Спросить", "Ask"],
  "companion.ask.you": ["Вы", "You"],
  "companion.ask.agent": ["Агент", "Agent"],

  // ── Настройки ──
} satisfies TranslationCatalog;
