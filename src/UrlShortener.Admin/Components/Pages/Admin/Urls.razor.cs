using System.Globalization;
using System.Security.Claims;
using Microsoft.JSInterop;
using UrlShortener.Shared.Auth;
using UrlShortener.Shared.Entities;
using UrlShortener.Shared.Models;
using UrlShortener.Shared.Services;

namespace UrlShortener.Admin.Components.Pages.Admin;

public partial class Urls
{
    private List<LinkView> _urls = [];
    private int _page = 1, _total;
    private bool _hasNext, _loading = true, _acting;
    private string _search = "", _statusFilter = "all", _privacyFilter = "all";
    private string? _error, _actionError, _notice, _detailError;
    private string _newShortPath = "", _newRedirect = "", _newPassword = "";
    private bool _newPrivate, _newListed = true, _showNewPassword;
    private LinkView? _selected, _pendingDelete;
    private string _deleteConfirmation = "", _editDestination = "", _editPassword = "";
    private bool _editPrivate, _editListed, _editDeprecated;
    private int? _editQuota;
    private DateTime? _editStart, _editEnd, _scheduleAt;
    private string _scheduleDestination = "";
    private List<LinkRevision> _history = [];
    private List<ScheduledLinkChange> _schedules = [];
    private int _historyPage = 1, _schedulePage = 1, _historyTotal, _scheduleTotal;
    private bool _historyNext, _scheduleNext;
    // Retain the key for identical retries, but replace it when the form changes.
    private string? _createDigest, _scheduleDigest;
    private string _createKey = Guid.NewGuid().ToString("N"), _scheduleKey = Guid.NewGuid().ToString("N");

    protected override async Task OnInitializedAsync() => await Load();

    private static string SafeError(Exception ex) => ex is ApiFault fault ? fault.Message
        : "The operation could not be completed. Refresh and try again.";
    private Task<T> Read<T>(string action, Guid? id, Func<ClaimsPrincipal, Task<T>> operation)
        => Guard.Run(action, id?.ToString() ?? "links", operation);

    private async Task Load()
    {
        _loading = true;
        try
        {
            var result = await Read("url.list", null, user => Links.List(_page, 50, _search,
                _statusFilter == "all" ? null : _statusFilter, _privacyFilter == "all" ? null : _privacyFilter,
                ApiV1Access.Private(user), default));
            _urls = result.Items; _total = result.Total; _hasNext = result.HasNext; _error = null;
        }
        catch (Exception ex) { _urls = []; _total = 0; _hasNext = false; _error = SafeError(ex); }
        finally { _loading = false; }
    }

    private async Task ApplyFilters() { _page = 1; await Load(); }
    private Task RefreshWorkspace() => _selected is null ? Load() : Open(_selected.Id);
    private async Task PreviousPage() { if (_page > 1) { _page--; await Load(); } }
    private async Task NextPage() { if (_hasNext) { _page++; await Load(); } }
    private void QuickPassword() { _newPrivate = true; _newPassword = SecurePasswordGenerator.Generate(); }

    private async Task Act(string action, Guid? id, Func<ClaimsPrincipal, Task> operation, string notice)
    {
        if (_acting) return;
        _acting = true; _actionError = null; _notice = null;
        try
        {
            await Guard.Run(action, id?.ToString() ?? "links", async user => { await operation(user); return true; }, mutation: true);
            _notice = notice;
            await Load();
        }
        catch (Exception ex)
        {
            _actionError = SafeError(ex);
            if (ex is ApiFault { Status: 401 or 403 }) { Close(); _urls = []; _total = 0; _hasNext = false; }
        }
        finally { _acting = false; }
    }

    private async Task Create()
    {
        var body = new LinkCreate { ShortPath = string.IsNullOrWhiteSpace(_newShortPath) ? null : _newShortPath.Trim(),
            DestinationUrl = _newRedirect.Trim(), Private = _newPrivate, Listed = _newListed, Password = _newPrivate ? _newPassword : null };
        var digest = ApiV1Links.Digest(body);
        if (_createDigest != digest) { _createKey = Guid.NewGuid().ToString("N"); _createDigest = digest; }
        await Act("url.create", null, async user =>
        {
            await Links.Create(body, ApiV1Access.Actor(user), _createKey, ApiV1Access.Private(user), default);
            _newShortPath = _newRedirect = _newPassword = ""; _newPrivate = false; _newListed = true;
            _showNewPassword = false;
            _createDigest = null;
        }, "Link created.");
    }

    private async Task ToggleArchive(LinkView link)
    {
        await Act(link.Archived ? "url.restore" : "url.archive", link.Id, async user =>
        {
            var updated = await Links.Patch(link.Id, link.Version, new(), ApiV1Access.Actor(user), ApiV1Access.Private(user), default, !link.Archived);
            if (_selected?.Id == link.Id) SetSelection(updated);
        }, link.Archived ? "Link restored." : "Link archived. Its alias is reserved.");
    }

    private void SetSelection(LinkView link)
    {
        _selected = link; _editDestination = link.DestinationUrl; _editPassword = "";
        _editPrivate = link.Private; _editListed = link.Listed; _editDeprecated = link.Deprecated;
        _editQuota = link.UsageQuota; _editStart = link.ScheduleStart?.UtcDateTime; _editEnd = link.ScheduleEnd?.UtcDateTime;
    }

    private async Task Open(Guid id)
    {
        if (_acting) return;
        _acting = true; _actionError = null; _detailError = null;
        try
        {
            SetSelection(await Read("url.get", id, user => Links.Get(id, ApiV1Access.Private(user), default)));
            _historyPage = _schedulePage = 1;
            await LoadDetails();
        }
        catch (Exception ex) { _actionError = SafeError(ex); Close(); }
        finally { _acting = false; }
    }

    private void Close() { _selected = null; _pendingDelete = null; _editPassword = ""; _deleteConfirmation = ""; _history = []; _schedules = []; }
    private static DateTimeOffset? Utc(DateTime? value) => value is null ? null : new DateTimeOffset(DateTime.SpecifyKind(value.Value, DateTimeKind.Utc));

    private async Task Save()
    {
        var link = _selected;
        if (link is null) return;
        // The contract cannot clear just one bound; ask for a deliberate two-step
        // change rather than silently preserving a bound the form shows as empty.
        if ((link.ScheduleStart is not null && _editStart is null && _editEnd is not null)
            || (link.ScheduleEnd is not null && _editEnd is null && _editStart is not null))
        { _actionError = "To remove an existing bound, clear both dates and save first, then set a new window."; return; }
        var body = new LinkPatch { DestinationUrl = _editDestination.Trim(), Private = _editPrivate,
            Password = _editPrivate && !string.IsNullOrEmpty(_editPassword) ? _editPassword : null,
            Listed = _editListed, Deprecated = _editDeprecated, UsageQuota = _editQuota, ClearQuota = _editQuota is null,
            ScheduleStart = Utc(_editStart), ScheduleEnd = Utc(_editEnd), ClearSchedule = _editStart is null && _editEnd is null };
        await Act("url.update", link.Id, async user =>
        {
            SetSelection(await Links.Patch(link.Id, link.Version, body, ApiV1Access.Actor(user), ApiV1Access.Private(user), default));
        }, "Changes saved.");
        if (_actionError is null) await LoadDetails();
    }

    private async Task LoadDetails()
    {
        if (_selected is null) return;
        var wasActing = _acting;
        _acting = true;
        var id = _selected.Id;
        _detailError = null; _history = []; _schedules = []; _historyNext = _scheduleNext = false;
        try
        {
            var history = await Read("url.history", id, user => Links.History(id, _historyPage, 10, ApiV1Access.Private(user), default));
            _history = history.Items; _historyTotal = history.Total; _historyNext = history.HasNext;
            var schedules = await Read("url.schedules", id, user => Schedules.List(id, _schedulePage, 10, ApiV1Access.Private(user), default));
            _schedules = schedules.Items; _scheduleTotal = schedules.Total; _scheduleNext = schedules.HasNext;
        }
        catch (Exception ex) { _detailError = SafeError(ex); }
        finally { _acting = wasActing; }
    }

    private async Task HistoryPrevious() { if (_historyPage > 1) { _historyPage--; await LoadDetails(); } }
    private async Task HistoryNext() { if (_historyNext) { _historyPage++; await LoadDetails(); } }
    private async Task SchedulesPrevious() { if (_schedulePage > 1) { _schedulePage--; await LoadDetails(); } }
    private async Task SchedulesNext() { if (_scheduleNext) { _schedulePage++; await LoadDetails(); } }

    private async Task RestoreRevision(Guid revision)
    {
        var link = _selected;
        if (link is null) return;
        await Act("url.revision.restore", link.Id, async user =>
        {
            SetSelection(await Links.RestoreRevision(link.Id, revision, link.Version, ApiV1Access.Actor(user), ApiV1Access.Private(user), default));
        }, "Destination restored.");
        if (_actionError is null) await LoadDetails();
    }

    private async Task Check()
    {
        if (_selected is null || _acting) return;
        _acting = true; _actionError = null; _notice = null;
        try
        {
            var result = await Read("url.check", _selected.Id, user => Links.Check(_selected.Id, null, ApiV1Access.Private(user), default));
            _notice = $"Current availability: {result.Outcome.Replace('_', ' ')} (checked {result.At.ToString("u", CultureInfo.InvariantCulture)}).";
        }
        catch (Exception ex) { _actionError = SafeError(ex); }
        finally { _acting = false; }
    }

    private async Task CreateSchedule()
    {
        var link = _selected;
        if (link is null) return;
        if (_scheduleAt is null) { _actionError = "Choose a future UTC time."; return; }
        var body = new DestinationChange(_scheduleDestination.Trim(), Utc(_scheduleAt)!.Value);
        var digest = ApiV1Links.Digest(new { link.Id, link.Version, body });
        if (_scheduleDigest != digest) { _scheduleKey = Guid.NewGuid().ToString("N"); _scheduleDigest = digest; }
        await Act("url.schedule.create", link.Id, async user =>
        {
            await Schedules.Create(link.Id, link.Version, body, ApiV1Access.Actor(user), _scheduleKey, ApiV1Access.Private(user), default);
            _scheduleDestination = ""; _scheduleAt = null; _scheduleDigest = null;
        }, "Destination change scheduled.");
        if (_actionError is null) await LoadDetails();
    }

    private async Task CancelSchedule(Guid change)
    {
        var link = _selected;
        if (link is null) return;
        await Act("url.schedule.cancel", link.Id, user => Schedules.Cancel(link.Id, change, ApiV1Access.Private(user), default), "Scheduled change cancelled.");
        if (_actionError is null) await LoadDetails();
    }

    private void CancelDelete() { _pendingDelete = null; _deleteConfirmation = ""; }
    private async Task ConfirmDelete()
    {
        var link = _pendingDelete;
        if (link is null || _deleteConfirmation != link.ShortPath) return;
        await Act("url.delete", link.Id, async user =>
        {
            // Legacy removal now accepts an atomic immutable ID/version predicate.
            var current = await Links.Get(link.Id, ApiV1Access.Private(user), default);
            ApiV1Links.Require(current.Version == link.Version, 412, "version_conflict", "Link changed; reload before deleting.");
            var result = await UrlAdmin.DeleteAsync(current.ShortPath, expectedId: link.Id, expectedVersion: link.Version);
            if (!result.Ok) throw new ApiFault(result.Status, "delete_failed", "Link could not be deleted. Refresh and try again.");
            Close();
        }, "Link permanently deleted.");
    }

    private async Task Copy(string shortPath)
    {
        _notice = null; _actionError = null;
        if (!PublicLink.ValidBase(Options.Value.PublicBaseUrl))
        { _actionError = "Configure UrlShortener:PublicBaseUrl to copy public short links."; return; }
        try
        {
            var link = PublicLink.Build(Options.Value.PublicBaseUrl!, shortPath);
            if (!await JS.InvokeAsync<bool>("urlShortener.copyText", link))
            { _actionError = "Copy failed. Check clipboard permissions and try again."; return; }
            _notice = $"Copied /{shortPath}";
        }
        catch { _actionError = "Clipboard not available in this browser."; }
    }
}
