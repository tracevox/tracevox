import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, Mail, Shield, Crown, Eye, Settings2,
  MoreHorizontal, Trash2, Send, Clock, X, Check,
  Loader2, AlertCircle, RefreshCw
} from 'lucide-react';
import * as api from '../../lib/api';

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: Users,
  viewer: Eye,
};

const ROLE_COLORS = {
  owner: 'bg-amber-500/20 text-amber-400',
  admin: 'bg-purple-500/20 text-purple-400',
  member: 'bg-blue-500/20 text-blue-400',
  viewer: 'bg-gray-500/20 text-gray-400',
};

export function TeamPage({ currentUser }) {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteMessage, setInviteMessage] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [editingMember, setEditingMember] = useState(null);

  useEffect(() => {
    loadTeamData();
  }, []);

  async function loadTeamData() {
    setLoading(true);
    try {
      const [membersRes, invitesRes, rolesRes] = await Promise.all([
        api.apiRequest('/api/team/members'),
        api.apiRequest('/api/team/invites'),
        api.apiRequest('/api/team/roles'),
      ]);
      
      setMembers(membersRes.members || []);
      setInvites(invitesRes.invites || []);
      setRoles(rolesRes.roles || []);
    } catch (err) {
      setError(err.message || 'Failed to load team data');
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e) {
    e.preventDefault();
    setInviting(true);
    setError(null);
    
    try {
      await api.apiPost('/api/team/invite', {
        email: inviteEmail,
        role: inviteRole,
        message: inviteMessage || undefined,
      });
      
      setSuccess(`Invitation sent to ${inviteEmail}`);
      setShowInviteModal(false);
      setInviteEmail('');
      setInviteRole('member');
      setInviteMessage('');
      await loadTeamData();
    } catch (err) {
      setError(err.message || 'Failed to send invitation');
    } finally {
      setInviting(false);
    }
  }

  async function handleResendInvite(inviteId) {
    try {
      await api.apiPost(`/api/team/invite/${inviteId}/resend`);
      setSuccess('Invitation resent');
    } catch (err) {
      setError(err.message || 'Failed to resend invitation');
    }
  }

  async function handleRevokeInvite(inviteId) {
    if (!confirm('Are you sure you want to revoke this invitation?')) return;
    
    try {
      await api.apiDelete(`/api/team/invite/${inviteId}`);
      await loadTeamData();
      setSuccess('Invitation revoked');
    } catch (err) {
      setError(err.message || 'Failed to revoke invitation');
    }
  }

  async function handleUpdateRole(memberId, newRole) {
    try {
      await api.apiPatch(`/api/team/members/${memberId}`, { role: newRole });
      await loadTeamData();
      setEditingMember(null);
      setSuccess('Role updated');
    } catch (err) {
      setError(err.message || 'Failed to update role');
    }
  }

  async function handleRemoveMember(memberId) {
    if (!confirm('Are you sure you want to remove this member?')) return;
    
    try {
      await api.apiDelete(`/api/team/members/${memberId}`);
      await loadTeamData();
      setSuccess('Member removed');
    } catch (err) {
      setError(err.message || 'Failed to remove member');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-green-500/20 border border-green-500 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-green-400" />
              <span className="text-green-400">{success}</span>
            </div>
            <button onClick={() => setSuccess(null)} className="text-green-400 hover:text-green-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="bg-red-500/20 border border-red-500 rounded-lg p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{error}</span>
            </div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Team Members</h2>
          <p className="text-gray-400 text-sm mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} • {invites.length} pending invite{invites.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Invite Member
        </button>
      </div>

      {/* Members List */}
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="text-gray-400 text-sm border-b border-gray-700 bg-gray-900/50">
              <th className="text-left py-3 px-4 font-medium">Member</th>
              <th className="text-left py-3 px-4 font-medium">Role</th>
              <th className="text-left py-3 px-4 font-medium">Status</th>
              <th className="text-left py-3 px-4 font-medium">Joined</th>
              <th className="text-right py-3 px-4 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const RoleIcon = ROLE_ICONS[member.role] || Users;
              const isCurrentUser = member.id === currentUser?.user_id;
              
              return (
                <tr key={member.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-semibold">
                        {(member.name || member.email)?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="text-white font-medium">
                          {member.name || 'Unknown'}
                          {isCurrentUser && <span className="text-gray-500 text-sm ml-2">(you)</span>}
                        </p>
                        <p className="text-gray-400 text-sm">{member.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    {editingMember === member.id ? (
                      <select
                        value={member.role}
                        onChange={(e) => handleUpdateRole(member.id, e.target.value)}
                        className="bg-gray-700 text-white rounded-lg px-3 py-1 text-sm border border-gray-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                        <RoleIcon className="w-3.5 h-3.5" />
                        {member.role}
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                      member.status === 'active' 
                        ? 'bg-green-500/20 text-green-400' 
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {member.status}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-400 text-sm">
                    {member.joined_at 
                      ? new Date(member.joined_at).toLocaleDateString()
                      : 'N/A'
                    }
                  </td>
                  <td className="py-4 px-4 text-right">
                    {!isCurrentUser && member.role !== 'owner' && (
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditingMember(editingMember === member.id ? null : member.id)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                          title="Edit role"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(member.id)}
                          className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                          title="Remove member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pending Invites */}
      {invites.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl border border-gray-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-700 bg-gray-900/50">
            <h3 className="text-white font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              Pending Invitations
            </h3>
          </div>
          <table className="w-full">
            <tbody>
              {invites.map((invite) => (
                <tr key={invite.id} className="border-b border-gray-700/50 last:border-0 hover:bg-gray-700/30">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400">
                        <Mail className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-white">{invite.email}</p>
                        <p className="text-gray-400 text-sm">Invited by {invite.invited_by}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${ROLE_COLORS[invite.role]}`}>
                      {invite.role}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-gray-400 text-sm">
                    Expires {new Date(invite.expires_at).toLocaleDateString()}
                  </td>
                  <td className="py-4 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleResendInvite(invite.id)}
                        className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
                        title="Resend invitation"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleRevokeInvite(invite.id)}
                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                        title="Revoke invitation"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invite Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-700">
                <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-purple-400" />
                  Invite Team Member
                </h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-gray-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleInvite} className="p-4 space-y-4">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Email Address</label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    required
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} - {role.description}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    Message <span className="text-gray-500">(optional)</span>
                  </label>
                  <textarea
                    value={inviteMessage}
                    onChange={(e) => setInviteMessage(e.target.value)}
                    placeholder="Add a personal message..."
                    rows={3}
                    className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                  />
                </div>
                
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="flex-1 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    {inviting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Invite
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TeamPage;

