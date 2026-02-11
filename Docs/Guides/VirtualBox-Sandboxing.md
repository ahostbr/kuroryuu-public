# VirtualBox Sandboxing Guide

Run agent-generated code in fully isolated VMs using VirtualBox. This is an **optional, manual setup** for users who want maximum isolation when executing untrusted code.

> **Status:** Manual setup only. Automated Desktop integration planned for a future release.

---

## Prerequisites

1. **VirtualBox 7.x** installed (https://www.virtualbox.org/wiki/Downloads)
2. **VirtualBox Extension Pack** installed (same page, needed for USB/RDP)
3. **Python 3.10+** with `pywin32` (Windows) or just Python (Linux/Mac)
4. An **OS ISO** (Ubuntu Server 24.04 recommended for minimal footprint)

### Install Python Dependencies (Windows)

```powershell
pip install pywin32
```

The `vboxapi` module ships with VirtualBox itself and is auto-discoverable when VBox is installed.

---

## Step 1: Create a Golden Image

The golden image is a pre-configured VM that serves as the base for all sandboxes. You create it once and clone/snapshot from it for each sandbox run.

### Option A: VBoxManage CLI

```bash
# Create VM
VBoxManage createvm --name "sandbox-golden" --ostype "Ubuntu_64" --register

# Configure hardware
VBoxManage modifyvm "sandbox-golden" \
  --memory 2048 \
  --cpus 2 \
  --nic1 nat \
  --audio-driver none \
  --graphicscontroller vmsvga \
  --vram 16

# Create and attach disk
VBoxManage createhd --filename "sandbox-golden.vdi" --size 20000 --variant Standard
VBoxManage storagectl "sandbox-golden" --name "SATA" --add sata --controller IntelAhci
VBoxManage storageattach "sandbox-golden" --storagectl "SATA" --port 0 --device 0 \
  --type hdd --medium "sandbox-golden.vdi"

# Attach Ubuntu ISO
VBoxManage storageattach "sandbox-golden" --storagectl "SATA" --port 1 --device 0 \
  --type dvddrive --medium "/path/to/ubuntu-24.04-server.iso"

# Start GUI for installation
VBoxManage startvm "sandbox-golden"
```

### Option B: Unattended Install (Zero-Touch)

VirtualBox can install the OS automatically:

```bash
VBoxManage unattended install "sandbox-golden" \
  --iso="/path/to/ubuntu-24.04-server.iso" \
  --user=sandbox \
  --password=sandbox \
  --full-user-name="Sandbox User" \
  --install-additions \
  --locale=en_US \
  --country=US \
  --hostname=sandbox.local

VBoxManage startvm "sandbox-golden"
# Wait for install to complete (~10-15 min), then power off
```

### After OS Installation

1. **Install Guest Additions** (required for Guest Control API):
   ```bash
   # Inside the VM:
   sudo apt update && sudo apt install -y build-essential linux-headers-$(uname -r)
   sudo mount /dev/cdrom /mnt
   sudo /mnt/VBoxLinuxAdditions.run
   sudo reboot
   ```

2. **Install any tools** your sandboxed code needs (Python, Node, gcc, etc.)

3. **Power off** the VM and take the golden snapshot:
   ```bash
   VBoxManage controlvm "sandbox-golden" poweroff
   VBoxManage snapshot "sandbox-golden" take "clean" --description "Fresh install, ready for sandboxing"
   ```

---

## Step 2: Sandbox Workflow

Two approaches, depending on your needs:

### Approach A: Snapshot Revert (Single VM, Serial Execution)

Best for: sequential tasks, simplest setup.

```bash
# 1. Restore clean state (~1-2 seconds)
VBoxManage snapshot "sandbox-golden" restore "clean"

# 2. Start headless
VBoxManage startvm "sandbox-golden" --type headless

# 3. Wait for Guest Additions to be ready, then run code
VBoxManage guestcontrol "sandbox-golden" run \
  --exe "/bin/bash" \
  --username sandbox --password sandbox \
  -- -c "echo 'Hello from sandbox' && python3 /tmp/task.py"

# 4. Copy files out
VBoxManage guestcontrol "sandbox-golden" copyto \
  --target-directory /tmp/ \
  --username sandbox --password sandbox \
  "/host/path/to/script.py"

VBoxManage guestcontrol "sandbox-golden" copyfrom \
  --target-directory /host/output/ \
  --username sandbox --password sandbox \
  "/tmp/output.txt"

# 5. Power off (state is discarded on next restore)
VBoxManage controlvm "sandbox-golden" poweroff
```

### Approach B: Linked Clones (Parallel Execution)

Best for: running multiple sandboxes simultaneously.

```bash
# 1. Clone from golden (linked = fast, shares base disk)
VBoxManage clonevm "sandbox-golden" --name "sandbox-001" \
  --options link --snapshot "clean" --register

# 2. Isolate network (no internet access)
VBoxManage modifyvm "sandbox-001" --nic1 none

# 3. Add shared folder for I/O
VBoxManage sharedfolder add "sandbox-001" \
  --name "task-input" --hostpath "/host/task/input" --readonly
VBoxManage sharedfolder add "sandbox-001" \
  --name "task-output" --hostpath "/host/task/output"

# 4. Start + execute + collect
VBoxManage startvm "sandbox-001" --type headless
VBoxManage guestcontrol "sandbox-001" run \
  --exe "/bin/bash" \
  --username sandbox --password sandbox \
  -- -c "cp /media/sf_task-input/script.py /tmp/ && python3 /tmp/script.py > /media/sf_task-output/result.txt 2>&1"

# 5. Destroy completely
VBoxManage controlvm "sandbox-001" poweroff
VBoxManage unregistervm "sandbox-001" --delete
```

---

## Step 3: Python API (Programmatic Control)

For scripting and future Desktop integration, use the Python API directly.

```python
from vboxapi import VirtualBoxManager

class SandboxVM:
    """Manages a VirtualBox sandbox VM lifecycle."""

    def __init__(self):
        self.mgr = VirtualBoxManager(None, None)
        self.vbox = self.mgr.getVirtualBox()
        self.constants = self.mgr.constants

    def clone_from_golden(self, name, golden_name="sandbox-golden", snapshot_name="clean"):
        """Create a linked clone from the golden image."""
        golden = self.vbox.findMachine(golden_name)
        snapshot = golden.findSnapshot(snapshot_name)

        clone = self.vbox.createMachine("", name, [], golden.OSTypeId, "")
        progress = golden.cloneTo(clone, self.constants.CloneMode_MachineState,
                                  [self.constants.CloneOptions_Link])
        progress.waitForCompletion(-1)

        clone.saveSettings()
        self.vbox.registerMachine(clone)
        return clone

    def isolate_network(self, vm):
        """Disable all network adapters."""
        session = self.mgr.getSessionObject()
        vm.lockMachine(session, self.constants.LockType_Write)
        adapter = session.machine.getNetworkAdapter(0)
        adapter.enabled = False
        session.machine.saveSettings()
        session.unlockMachine()

    def start_headless(self, vm):
        """Start VM in headless mode."""
        session = self.mgr.getSessionObject()
        progress = vm.launchVMProcess(session, "headless", [])
        progress.waitForCompletion(-1)
        return session

    def execute(self, session, command, user="sandbox", password="sandbox", timeout_ms=60000):
        """Run a command inside the guest and return stdout."""
        console = session.console
        guest = console.guest

        gs = guest.createSession(user, password, "", "kuroryuu-sandbox")
        gs.waitForArray([self.constants.GuestSessionWaitForFlag_Start], 30000)

        proc = gs.processCreate(
            "/bin/bash", ["/bin/bash", "-c", command], '', [],
            [self.constants.ProcessCreateFlag_WaitForStdOut,
             self.constants.ProcessCreateFlag_WaitForStdErr],
            timeout_ms
        )
        proc.waitForArray([self.constants.ProcessWaitForFlag_Start], 30000)

        # Read stdout
        output = b""
        while True:
            chunk = proc.read(1, 65536, timeout_ms)  # handle 1 = stdout
            if not chunk:
                break
            output += bytes(chunk)

        gs.close()
        return output.decode("utf-8", errors="replace")

    def destroy(self, vm, session=None):
        """Power off and delete the VM."""
        if session:
            try:
                session.console.powerDown().waitForCompletion(30000)
            except:
                pass
            try:
                session.unlockMachine()
            except:
                pass

        vm.unregister(self.constants.CleanupMode_DetachAllReturnNone)
        progress = vm.deleteConfig([])
        progress.waitForCompletion(-1)


# Usage example
if __name__ == "__main__":
    sandbox = SandboxVM()

    vm = sandbox.clone_from_golden("sandbox-001")
    sandbox.isolate_network(vm)
    session = sandbox.start_headless(vm)

    result = sandbox.execute(session, "echo 'Hello from isolated VM' && uname -a")
    print(result)

    sandbox.destroy(vm, session)
```

---

## Network Isolation Modes

| Mode | Flag | Use Case |
|------|------|----------|
| **None** | `--nic1 none` | Full air-gap, no network at all |
| **Internal** | `--nic1 intnet` | VM-to-VM only (multi-VM sandboxes) |
| **NAT** | `--nic1 nat` | Outbound internet (for package installs during setup) |
| **Host-Only** | `--nic1 hostonly` | Host can reach VM, no internet |

For sandboxing untrusted code, always use **None** or **Internal**.

---

## Performance Expectations

| Operation | Time |
|-----------|------|
| Snapshot restore | ~1-2s |
| Linked clone creation | ~2-3s |
| VM boot (headless) | ~5-10s |
| Guest Additions ready | ~10-15s after boot |
| Full cycle (clone + boot + exec + destroy) | ~20-30s |

### Resource Usage Per VM

| Resource | Typical |
|----------|---------|
| RAM | 1-2 GB per VM |
| Disk (linked clone) | ~50-200 MB differential |
| CPU | 1-2 cores per VM |

Plan for **4-8 concurrent sandboxes** on a typical dev machine (16-32GB RAM).

---

## Tips

- **Alpine Linux** instead of Ubuntu cuts boot time to ~3s and disk to ~200MB
- **Immutable disks** (`VBoxManage modifymedium disk X.vdi --type immutable`) auto-revert on power off
- **Port forwarding** through NAT lets you expose specific guest services if needed:
  ```bash
  VBoxManage modifyvm "sandbox" --nat-pf1 "ssh,tcp,,2222,,22"
  ```
- **Timeouts are critical** — always set execution timeouts to prevent runaway processes
- **Guest Additions version** should match VirtualBox version for reliable Guest Control

---

## Future: Desktop Integration

A future Kuroryuu Desktop release may include:
- Settings panel to configure sandbox VM defaults (RAM, CPU, OS, network mode)
- One-click golden image provisioning
- Automatic sandbox-per-task execution from the task queue
- Output capture and display in the Dashboard

For now, use the manual workflow above or wrap the Python API into your own automation scripts.
