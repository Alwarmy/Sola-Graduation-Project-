from __future__ import annotations

from getpass import getpass


def prompt_text(
    label: str,
    *,
    default: str | None = None,
    allow_empty: bool = False,
) -> str:
    while True:
        suffix = f" [{default}]" if default is not None else ""
        raw_value = input(f"{label}{suffix}: ").strip()
        if raw_value:
            return raw_value
        if default is not None:
            return default
        if allow_empty:
            return ""
        print("Please enter a value.")


def prompt_password(
    label: str,
    *,
    default_if_blank: str | None = None,
) -> str:
    while True:
        prompt_label = label
        if default_if_blank:
            prompt_label = f"{label} (leave blank to use the recommended demo password)"
        value = getpass(f"{prompt_label}: ")
        if value:
            return value
        if default_if_blank is not None:
            return default_if_blank
        print("Please enter a password.")


def prompt_yes_no(question: str, *, default: bool = True) -> bool:
    suffix = "[Y/n]" if default else "[y/N]"
    while True:
        answer = input(f"{question} {suffix}: ").strip().lower()
        if not answer:
            return default
        if answer in {"y", "yes"}:
            return True
        if answer in {"n", "no"}:
            return False
        print("Please answer yes or no.")


def prompt_int(
    label: str,
    *,
    default: int | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> int:
    while True:
        raw_value = prompt_text(label, default=str(default) if default is not None else None)
        try:
            value = int(raw_value)
        except ValueError:
            print("Please enter a whole number.")
            continue

        if minimum is not None and value < minimum:
            print(f"Please enter a value greater than or equal to {minimum}.")
            continue
        if maximum is not None and value > maximum:
            print(f"Please enter a value less than or equal to {maximum}.")
            continue
        return value


def prompt_choice(
    question: str,
    options: list[str],
    *,
    default_index: int = 0,
) -> int:
    if not options:
        raise ValueError("prompt_choice requires at least one option.")

    while True:
        print(question)
        for index, option in enumerate(options, start=1):
            marker = " (default)" if index - 1 == default_index else ""
            print(f"  {index}. {option}{marker}")
        raw_value = input("Choose an option: ").strip()
        if not raw_value:
            return default_index
        try:
            value = int(raw_value)
        except ValueError:
            print("Please enter a number from the list.")
            continue
        if 1 <= value <= len(options):
            return value - 1
        print("Please choose a valid number from the list.")


def prompt_multi_choice(
    question: str,
    options: list[str],
    *,
    min_count: int = 1,
    max_count: int | None = None,
    default_indices: list[int] | None = None,
) -> list[int]:
    if not options:
        raise ValueError("prompt_multi_choice requires at least one option.")

    rendered_default = None
    if default_indices:
        rendered_default = ",".join(str(index + 1) for index in default_indices)

    while True:
        print(question)
        for index, option in enumerate(options, start=1):
            print(f"  {index}. {option}")

        raw_value = prompt_text(
            "Choose one or more numbers separated by commas",
            default=rendered_default,
        )
        selections: list[int] = []
        seen: set[int] = set()

        try:
            for chunk in raw_value.split(","):
                value = int(chunk.strip())
                if not 1 <= value <= len(options):
                    raise ValueError
                zero_based = value - 1
                if zero_based not in seen:
                    seen.add(zero_based)
                    selections.append(zero_based)
        except ValueError:
            print("Please enter valid numbers separated by commas.")
            continue

        if len(selections) < min_count:
            print(f"Please choose at least {min_count} option(s).")
            continue
        if max_count is not None and len(selections) > max_count:
            print(f"Please choose no more than {max_count} option(s).")
            continue
        return selections


def pause(message: str = "Press Enter to continue...") -> None:
    input(message)
