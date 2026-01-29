00:00:00
Are we going above managing agents and giving that role to AI too? Ever since AI entered the agentic space and started interacting with tools, everything has changed. Now we let AI interact with tools on our behalf using agentic systems like claude code to do the work for us. Our role has shifted to simply delegating tasks to agents and letting them handle the execution. But we are already moving beyond this delegation. Claude has a new update where it handles the tasks in a different way than it

00:00:26
usually did by taking over much of the delegation itself and integrating it directly into the product. This added another layer of abstraction and changed how we work. This is exactly what this startup founder talks about in his article. Now, Claude's new update might not sound like something impactful because apparently it sounds like new to-dos, but it's actually a huge update. The main idea behind the agent swarm is having multiple AI agents coordinate on complex tasks, spawning sub agents and

00:00:52
managing dependencies in parallel. This means they can take a complex task from a user and break it down into multiple tasks for AI agents, letting them work in isolation. So now you can talk to Claude as if you're talking to a project manager, giving it a wide task to work on, and Claude automatically does the breakdown and delegation. With this update, your task can survive the clear command and even a session restart. We'll explain exactly how that works in just a moment. Before this task system,

00:01:17
when working with Claude, we had to hit compact more often because even if it did divide tasks, in the end, it was still a single brain trying to hold complex processes in its small limited context window. This became more annoying when working on larger tasks because it used to lose context more often and we had to create workflows with structured notes so it wouldn't lose context as frequently. Now, we've noticed that when working with Claude, we don't need to hit compact as often as

00:01:43
we used to. What we used to do manually with notes in claude.md or other guidance files. They've now incorporated into their own product. The agents are not sharing a single context window. Each agent actually has its own context window. As we mentioned earlier, you interact with the main claude who acts as a task coordinator. This coordinator creates a task graph that identifies and breaks the work down into smaller tasks. It then determines the type of each task, whether it's sequential, meaning

00:02:08
the previous task needs to be completed before starting the next one, or nonsequential or parallel, meaning there are no dependencies and they can run at the same time. Each task follows a full workflow to investigate, plan, and implement the task with each stage being blocked by the previous one. Once the task graph is created, it spawns agents and delegates different models to each task based on its complexity. Some tasks like exploring folders don't need heavy reasoning from Opus 4.5 and can be

00:02:35
handled by Haiku or Sonnet models. Each agent gets a fresh 200k context window which is isolated from the other processes. This is different from how Claude worked before where it relied on a single context window which caused problems. With this system, each agent is able to focus on one thing. You've probably noticed we build a lot in these videos. All the prompts, the code, the templates, you know, the stuff you'd normally have to pause and copy from the screen. It's all in our community. This

00:03:00
video and every video before it, too. Links in the description. Now, that was the detailed explanation of how the new task system works. And at first, it might not sound much different. Previously, it used to write tasks into the context window, and once the context window filled up, it had to compact, which caused the to-dos to get messed up in the process. Now, tasks aren't just in the context window. They've added a new task folder inside the main.clude clawed folder where there's a folder for

00:03:24
each session identified by the session ID of that session. Inside each folder, there's a set of JSON documents representing tasks in the system. These JSON files are identified by their IDs and contain a name, description, and status. The two main keys to focus on are blocks and blocked by. The blocks key lists the tasks that are blocked by the current task while blocked by contains all the tasks that are blocking the current task and after those execute the current task can proceed. This setup

00:03:51
ensures the correct sequence because it creates a dependency graph showing which tasks depend on others and which are blocked. Basically, this guides Claude so it can't skip a task until the required one is completed. Without this graph feature, you would have had to explain to Claude again every time you wanted to use the clear command, but that's no longer necessary. This logic has been externalized into a file structure which allows the system to retain its state even when the session

00:04:16
ends no matter how many times later you come back to it. That way, Claude doesn't have to figure out which tasks to redo. The graph doesn't forget and doesn't drift from what it needs to do. The folder names are currently just random IDs for the session. But if you set an environment variable with a custom name, it will identify the session by that name. This ensures that tasks aren't lost even if you close your terminal and Claude can continue the session seamlessly. With this update,

00:04:40
Anthropic has finally killed the Ralph loop, which was originally all about re-anchoring the task system. Now, Claude handles it automatically on its own. Also, if you are enjoying our content, consider pressing the hype button because it helps us create more content like this and reach out to more people. Now, this approach matters because it gives Claude a degree of freedom in parallelism by effectively managing the parallel and sequential steps together. Claude identifies everything that can run in parallel and

00:05:06
everything that cannot. And based on that, it saves time in completing the tasks. For example, it sees that task one and task two have no dependencies. So, it spawns both at once. At the next layer, it identifies that task three and task four are blocked by task one. So, it waits for task one to complete before starting the next tasks. In this way, the last task completes in just three cycles. Previously, these five steps would have taken five waves, each waiting sequentially for the previous one. But with this approach, execution

00:05:34
time is reduced by running tasks simultaneously. This not only saves time, but also reduces costs because the model matches its effort to the tasks and doesn't waste extra tokens on smaller tasks. But before we see them in action, here's a word from our sponsor, Lovart. Looking at these designs, you'd think a pro agency made them, but this is the first AI design agent built with true creative intuition. Design is easier with Lovart because it helps you visualize any concept instantly. From

00:06:00
complex packaging and interior layouts to unique jewelry collections, it's the design agent that delivers professional creative work to get the job done. The real power lies in its exclusive editing features. Usually AI text is a mess, but with text edit, I can rewrite headlines perfectly just by typing. With Love Art AI, you can generate stunning posters for work and use edit elements to move, adjust, or swap individual layers, or touch edit to swap or change objects precisely without breaking the style.

00:06:28
This lets you produce way more highquality posts without extra effort. You can even turn the final static visual into a video with one click. Start designing for free by checking the link in the pinned comment. Our team tested this swarm across multiple scenarios on both claude code and co-work. For those who don't know, co-work is basically claude code but for non-developers. The idea comes from the fact that when they first developed claude code, it was intended for developers only, but they realized it

00:06:54
could be useful for almost everything else. Co-work has more guard rails than clawed code because it's not aimed at developers. This helps prevent the agent from accidentally deleting or messing with something it shouldn't, making it much friendlier for non-technical users. Our team has also been using it for non-development tasks like research, planning, and even managing our channel's ideation process by connecting it with notion. So, Anthropic made it simpler and released co-work, which

00:07:19
essentially does everything Claude Code does, interacting with file systems and making changes when needed. Co-works really well if you want to organize folders or make changes in them. We've been using co-work extensively for this purpose. We had a folder with a lot of projects mostly for testing purposes and we were having trouble navigating it to find a particular skill we had used in a previous project. So we asked it to create a document detailing what each project contains. We also asked it to

00:07:45
look at the claw.md and the reusable commands we'd created and differentiate based on that. It started by exploring the folder we had connected and creating to-dos. Then it used the same agent swarm method we talked about earlier with clawed code. It spawned multiple agents to read the files in batches and create documentation for what each project contained. In the end, every project had a file summarizing what it does, making it much easier to navigate and find exactly what we needed. We used

00:08:11
co-work for feasibility and market research for an app we were working on. And it created a proper document containing all the findings. Just like claude code, it asked questions and based on the answers produced a comprehensive report. It saved the report in the folder we had connected co-work with. You could do something similar with clawed chat, but now it actually has access to the documents inside the folder, which helps guide the research much more effectively. The generated report also had proper

00:08:36
formatting because co-work comes with specialized skills to create documents better than before. Now, once the research and PRD documentation was complete with co-work, we moved to Claude code for the actual implementation part. We asked Claude code to look at the document inside the folder which was used to guide co-work on the project idea for which it did the research and break it down into different components focusing on one aspect of the PRD. It analyzed that the PRD contained multiple sections and

00:09:03
realized that these could be handled in parallel since they were not dependent on each other. So it spawned multiple agents to work on writing them simultaneously with each agent working independently. Without the parallelism, it would be 16 sequential steps which were reduced to one step because of parallelism leading to significantly speeding up of the process. Now, Claude breaks down complex tasks automatically. But sometimes it doesn't because it does not consider the request to be complex

00:09:29
enough for breakdown. If it doesn't, you can prompt it with something like break this down into tasks with dependencies. It will then create the dependency graph and use it to manage the workflow. You can even see the to-dos by hittingtrl +t. Since this was a long-term project, we set the CLI flag to the project's name so we could return to it later. That brings us to the end of this video. If you'd like to support the channel and help us keep making videos like this, you can do so by joining AIABS Pro. As

00:09:55
always, thank you for watching and I'll see you in the next one.

