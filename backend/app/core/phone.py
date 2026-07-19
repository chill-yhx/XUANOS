import re

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberType


class MainlandPhoneError(ValueError):
    pass


def normalize_mainland_phone(value: str) -> str:
    compact = re.sub(r"[\s-]", "", value.strip())
    if compact.startswith("+86"):
        national_number = compact[3:]
    elif compact.isascii() and compact.isdigit():
        national_number = compact
    else:
        raise MainlandPhoneError("请输入有效的中国大陆手机号。")

    if len(national_number) != 11 or not national_number.startswith("1"):
        raise MainlandPhoneError("请输入有效的中国大陆手机号。")

    try:
        parsed = phonenumbers.parse(f"+86{national_number}", None)
    except NumberParseException as exc:
        raise MainlandPhoneError("请输入有效的中国大陆手机号。") from exc

    if (
        parsed.country_code != 86
        or phonenumbers.region_code_for_number(parsed) != "CN"
        or not phonenumbers.is_possible_number(parsed)
        or not phonenumbers.is_valid_number(parsed)
        or phonenumbers.number_type(parsed) != PhoneNumberType.MOBILE
    ):
        raise MainlandPhoneError("请输入有效的中国大陆手机号。")

    return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)


def mask_mainland_phone(phone_e164: str) -> str:
    try:
        parsed = phonenumbers.parse(phone_e164, None)
    except NumberParseException:
        return "***"
    national_number = str(parsed.national_number)
    if len(national_number) != 11:
        return "***"
    return f"{national_number[:3]}****{national_number[-4:]}"
