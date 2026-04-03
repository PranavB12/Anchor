#!/usr/bin/env python3

# Run `python3 ./weekly_report.py --help` for more info

# Gets all commits created by a user and formats them in the format
# for weekly reports expected by CS307 at Purdue

import subprocess
import argparse
import datetime
import sys

def get_default_git_user():
    try:
        email = subprocess.check_output(
            ["git", "config", "user.email"],
            text=True
        ).strip()

        name = subprocess.check_output(
            ["git", "config", "user.name"],
            text=True
        ).strip()

        return name, email

    except subprocess.CalledProcessError:
        return None, None



def weeks_since_start(start=datetime.date(2026, 2, 15)):
    today = datetime.date.today()

    days_since = (today - start).days
    weeks_since = days_since // 7

    return weeks_since



def get_heading_of_file(file="README.md"):
    try:
        with open(file, "r", encoding="utf-8") as f:
            for line in f:
                stripped = line.strip()
                if stripped.startswith("#"):
                    return stripped.lstrip("#").strip()
    except FileNotFoundError:
        return None

    return None



def get_git_commits_since(days=7, author=""):
    since_date = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime("%Y-%m-%d")

    git_command = [
        "git",
        "log",
        # glob makes it so that it works for remote and local branches
        "--glob=refs/heads/*",
        "--glob=refs/remotes/*",
        "--no-merges",
        f"--since={since_date}",
        "--pretty=format:%ad|%h|%s",
        "--date=short",
        f"--author={author}"
    ]

    try:
        result = subprocess.run(
            git_command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
    except subprocess.CalledProcessError as e:
        print("Error running git log:")
        print(e.stderr)
        sys.exit(1)

    commits = []
    for line in result.stdout.strip().split("\n"):
        if not line:
            continue
        date, commit_id, subject = line.split("|", 2)
        commits.append({
            "date": date,
            "commit_id": commit_id,
            "subject": subject
        })

    return commits


def print_weekly_report(commits,
                        name="<YOUR NAME>",
                        team_number="<TEAM NUMBER>",
                        project_name="<PROJECT NAME>",
                        week="<WEEK NUMBER>"
                        ):
    print(f"=== Weekly Individual Report (Team {team_number}: {project_name}) ===")
    print(f"Name: {name}")
    print(f"Week {week} (Summary)")

    if not commits:
        print("<DATE> <HOURS> <COMMIT ID> <DESCRIPTION>")
    else:
        for commit in commits:
            print(f"{commit['date']}   <HOURS>   {commit['commit_id']} {commit['subject']}")

    print(f"\nWeek {int(week) + 1} (Plan)")
    print("<DATE>   <HOURS>    <DESCRIPTION>")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Weekly CS 307 report generator"
    )

    weeks = weeks_since_start()

    parser.add_argument(
            "-w", "--week",
            type=int,
            default=weeks,
            help=f"Week number (default: weeks since feb 15, 2026 ({weeks}))"
            )

    name, email = get_default_git_user()
    author = email.split("@")[0] if email else ""
    name = name if name else "<YOUR NAME>"


    parser.add_argument(
            "-a", "--author",
            type=str,
            default=author,
            help=f"Substring of Git Author (default: git author email of system ({email}))"
            )

    parser.add_argument(
            "-n", "--name",
            type=str,
            default=name,
            help=f"Name to attribute to (default: Git config name ({name}))"
            )

    parser.add_argument(
            "-t", "--team",
            type=int,
            default=22, # Couldn't think of any nice way to figure this one out automatically
            help="Team of project (default: 22)"
            )

    project_name = get_heading_of_file()
    project_name = project_name if project_name else "<PROJECT NAME>"

    parser.add_argument(
            "-p", "--project",
            type=str,
            default= project_name ,
            help=f"Project name (default: Heading of README.md ({project_name}))"
            )

    parser.add_argument(
            "-d", "--days",
            type=int,
            default=7,
            help="Number of days to look back to (default: 7)"
            )

    args = parser.parse_args()

    commits = get_git_commits_since(days=args.days, author=args.author)

    print_weekly_report(commits, name=args.name, week=args.week, project_name=args.project, team_number=args.team)
