import argparse
import sys

from app.core.errors import APIError
from app.db.session import SessionLocal
from app.services.user_admin_service import AdminUserView, UserAdminService


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Manage invited XUANOS seed users")
    commands = parser.add_subparsers(dest="command", required=True)

    invite = commands.add_parser("invite", help="Invite a mainland China mobile number")
    invite.add_argument("--phone", required=True)
    invite.add_argument("--display-name", required=True)

    commands.add_parser("list", help="List invited users with masked phone numbers")

    for name in ("disable", "enable", "reset-data"):
        command = commands.add_parser(name)
        command.add_argument("--phone", required=True)
    return parser


def _render_user(user: AdminUserView) -> str:
    verified = "verified" if user.phone_verified else "unverified"
    password = "password-set" if user.has_password else "sms-only"
    return f"{user.id}\t{user.phone_masked}\t{user.display_name or '-'}\t{user.status}\t{verified}\t{password}"


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        with SessionLocal() as session:
            service = UserAdminService(session)
            if args.command == "invite":
                print(_render_user(service.invite(args.phone, args.display_name)))
            elif args.command == "list":
                users = service.list_users()
                print("ID\tPHONE\tNAME\tSTATUS\tVERIFICATION\tPASSWORD")
                for user in users:
                    print(_render_user(user))
            elif args.command == "disable":
                print(_render_user(service.disable(args.phone)))
            elif args.command == "enable":
                print(_render_user(service.enable(args.phone)))
            elif args.command == "reset-data":
                print(_render_user(service.reset_data(args.phone)))
    except APIError as exc:
        print(f"{exc.code}: {exc.message}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
