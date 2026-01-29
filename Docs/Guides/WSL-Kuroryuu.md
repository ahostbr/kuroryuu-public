  Run this in Windows PowerShell as Admin:

  netsh interface portproxy add v4tov4 listenaddress=192.168.32.1 listenport=8100 connectaddress=127.0.0.1 connectport=8100

  This forwards WSL's requests to Windows localhost. No external
  exposure.

  To verify it worked:
  netsh interface portproxy show all

  To remove later if needed:
  netsh interface portproxy delete v4tov4 listenaddress=192.168.32.1 listenport=8100
  
  
  
  
  
  
  
  
  
  
  ADD FIREWALL RULE :
  
  netsh advfirewall firewall add rule name="WSL MCP 8100" dir=in action=allow protocol=tcp localport=8100 localip=192.168.32.1
  
  
  
  
  
  ● Excellent! Here's what we set up:
  CLI: kimi-cli
  Solution: Direct STDIO with Linux path command + Windows path args
  ────────────────────────────────────────
  CLI: kiro-cli
  Solution: Bash wrapper script at ~/.kiro/kuroryuu-mcp-wrapper.sh
  Both now connect to the same MCP server running on Windows.

  Bonus: The netsh port forward is still active if you ever need HTTP
  access from WSL:
  - http://192.168.32.1:8100/mcp works for tools that support plain HTTP
  POST

  To clean up the firewall/portproxy later if not needed:
  netsh interface portproxy delete v4tov4 listenaddress=192.168.32.1
  listenport=8100
  netsh advfirewall firewall delete rule name="WSL MCP 8100"