/**
 * Módulo de cálculos precisos de horas trabalhadas, intervalos e períodos
 */

/**
 * Converte minutos inteiros para uma string amigável: "08h 30m"
 * @param {number} totalMinutes 
 * @returns {string}
 */
function formatMinutes(totalMinutes) {
  if (isNaN(totalMinutes) || totalMinutes <= 0) {
    return '00h 00m';
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.floor(totalMinutes % 60);
  return `${String(hours).padStart(2, '0')}h ${String(minutes).padStart(2, '0')}m`;
}

/**
 * Converte milissegundos para string em tempo real: "08h 30m 15s"
 * @param {number} ms 
 * @returns {string}
 */
function formatMillisecondsDetailed(ms) {
  if (isNaN(ms) || ms <= 0) {
    return '00:00:00';
  }
  const totalSecs = Math.floor(ms / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const minutes = Math.floor((totalSecs % 3600) / 60);
  const seconds = totalSecs % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Calcula os minutos líquidos trabalhados a partir das marcas de ponto
 * Desconta automaticamente intervalo de almoço/descanso se registrado
 * @param {string|Date} clockIn Horário de entrada
 * @param {string|Date|null} clockOut Horário de saída (ou null se em andamento)
 * @param {string|Date|null} lunchStart Início do intervalo
 * @param {string|Date|null} lunchEnd Fim do intervalo
 * @param {Date} [currentTime] Horário atual de referência para expedientes em andamento
 * @returns {{ totalMinutes: number, inProgress: boolean, lunchMinutes: number }}
 */
function calculateWorkMinutes(clockIn, clockOut, lunchStart, lunchEnd, currentTime = new Date()) {
  if (!clockIn) {
    return { totalMinutes: 0, inProgress: false, lunchMinutes: 0 };
  }

  const inDate = new Date(clockIn);
  const isCompleted = !!clockOut;
  const outDate = clockOut ? new Date(clockOut) : new Date(currentTime);

  let lunchDurationMs = 0;
  if (lunchStart) {
    const lStart = new Date(lunchStart);
    if (lunchEnd) {
      const lEnd = new Date(lunchEnd);
      lunchDurationMs = Math.max(0, lEnd.getTime() - lStart.getTime());
    } else if (!isCompleted) {
      // Se está atualmente em almoço
      lunchDurationMs = Math.max(0, outDate.getTime() - lStart.getTime());
    }
  }

  let totalMs = outDate.getTime() - inDate.getTime() - lunchDurationMs;
  if (totalMs < 0) totalMs = 0;

  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const lunchMinutes = Math.floor(lunchDurationMs / (1000 * 60));

  return {
    totalMinutes,
    inProgress: !isCompleted,
    lunchMinutes,
  };
}

/**
 * Obtém as datas de início e fim da semana atual (Segunda-feira a Domingo)
 * @param {Date} date
 * @returns {{ startOfWeek: string, endOfWeek: string }} Datas em formato YYYY-MM-DD
 */
function getWeekRange(date = new Date()) {
  const current = new Date(date);
  const day = current.getDay(); // 0 é domingo, 1 é segunda
  const diffToMonday = current.getDate() - day + (day === 0 ? -6 : 1);

  const monday = new Date(current.setDate(diffToMonday));
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    startOfWeek: monday.toISOString().split('T')[0],
    endOfWeek: sunday.toISOString().split('T')[0],
  };
}

/**
 * Obtém as datas de início e fim do mês atual
 * @param {Date} date 
 * @returns {{ startOfMonth: string, endOfMonth: string }} Datas em formato YYYY-MM-DD
 */
function getMonthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    startOfMonth: firstDay.toISOString().split('T')[0],
    endOfMonth: lastDay.toISOString().split('T')[0],
  };
}

module.exports = {
  formatMinutes,
  formatMillisecondsDetailed,
  calculateWorkMinutes,
  getWeekRange,
  getMonthRange,
};
