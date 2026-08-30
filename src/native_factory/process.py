from __future__ import annotations

import os
import shlex
import subprocess
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class ProcessRunner:
    dry_run: bool = False
    commands: list[str] = field(default_factory=list)

    def run(
        self,
        command: Sequence[str] | str,
        *,
        cwd: Path,
        env: Mapping[str, str] | None = None,
        shell: bool = False,
    ) -> None:
        printable = command if isinstance(command, str) else shlex.join(command)
        self.commands.append(f"cd {shlex.quote(str(cwd))} && {printable}")
        if self.dry_run:
            return
        merged_env = os.environ.copy()
        if env:
            merged_env.update(env)
        subprocess.run(command, cwd=cwd, env=merged_env, shell=shell, check=True)

